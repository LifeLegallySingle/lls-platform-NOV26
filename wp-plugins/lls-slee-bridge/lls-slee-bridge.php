<?php
/**
 * Plugin Name:       LLS SLEE Bridge
 * Description:       Connects LLS HUB to SLEE (Single Life Email Engine) on Cloudflare Workers. Signs HUB→SLEE events, retries anything that fails, and receives SLEE→HUB engagement feedback (clicks, unsubscribes, bounces).
 * Version:           1.0.1
 * Requires PHP:      7.4
 * Author:            Life Legally Single™
 * Text Domain:       lls-slee-bridge
 */

if (!defined('ABSPATH')) { exit; }

define('LLS_SLEE_BRIDGE_VERSION', '1.0.1');
define('LLS_SLEE_OUTBOX_TABLE', 'lls_slee_outbox');

/* -------------------------------------------------------------------------
 * Config — wp-config.php constants win over the settings screen.
 *   define('LLS_SLEE_URL', 'https://slee.legallysingle.com');
 *   define('LLS_SLEE_SECRET', '…same value as the Worker HUB_SHARED_SECRET…');
 * ---------------------------------------------------------------------- */
function lls_slee_cfg($key) {
    $const = array('url' => 'LLS_SLEE_URL', 'secret' => 'LLS_SLEE_SECRET', 'enabled' => 'LLS_SLEE_ENABLED');
    if (isset($const[$key]) && defined($const[$key])) { return constant($const[$key]); }
    $opt = get_option('lls_slee_settings', array());
    if ($key === 'enabled') { return !empty($opt['enabled']); }
    return isset($opt[$key]) ? $opt[$key] : '';
}

function lls_slee_event_url() {
    $u = rtrim((string) lls_slee_cfg('url'), '/');
    return $u ? $u . '/v1/event' : '';
}

function lls_slee_ready() {
    return lls_slee_cfg('enabled') && lls_slee_event_url() && lls_slee_cfg('secret');
}

/** sha256=HMAC(secret, "{timestamp}.{body}") — identical to the Worker's verifySigned(). */
function lls_slee_sign($body) {
    $ts = (string) time();
    return array(
        'X-LLS-Timestamp' => $ts,
        'X-LLS-Signature' => 'sha256=' . hash_hmac('sha256', $ts . '.' . $body, (string) lls_slee_cfg('secret')),
    );
}

/* -------------------------------------------------------------------------
 * Identity restore: attach HUB's signed identify query string to every event,
 * so every email CTA lands the person back in their HUB identity (fixes bare-URL Item #4 for SLEE mail).
 * ---------------------------------------------------------------------- */
function lls_slee_identify_url($email, $hub_id = null) {
    $override = apply_filters('lls_slee_identify_url', null, $email, $hub_id);
    if ($override !== null) { return (string) $override; }
    if (!function_exists('lls_hub_generate_identify_url')) { return ''; }

    try {
        // Map arguments by parameter name so this survives HUB signature changes.
        $ref  = new ReflectionFunction('lls_hub_generate_identify_url');
        $args = array();
        foreach ($ref->getParameters() as $p) {
            $n = strtolower($p->getName());
            if (strpos($n, 'url') !== false || strpos($n, 'dest') !== false || strpos($n, 'redirect') !== false) {
                $args[] = home_url('/');
            } elseif (strpos($n, 'email') !== false) {
                $args[] = $email;
            } elseif (strpos($n, 'id') !== false || strpos($n, 'identity') !== false || strpos($n, 'uuid') !== false) {
                $args[] = $hub_id ? $hub_id : $email;
            } elseif ($p->isOptional()) {
                break;
            } else {
                $args[] = $email;
            }
        }
        $url = (string) call_user_func_array('lls_hub_generate_identify_url', $args);
        return wp_http_validate_url($url) ? $url : '';
    } catch (\Throwable $e) {
        return '';
    }
}

function lls_slee_enrich(array $payload) {
    $email = '';
    foreach (array('email', 'EMAIL') as $k) { if (!empty($payload[$k])) { $email = (string) $payload[$k]; break; } }
    if ($email && empty($payload['identify_url'])) {
        $hub = isset($payload['hub_id']) ? $payload['hub_id'] : (isset($payload['identity_id']) ? $payload['identity_id'] : null);
        $url = lls_slee_identify_url($email, $hub);
        if ($url) {
            // Full URL keeps HUB's identify path; SLEE swaps its redirect for the page actually clicked.
            $payload['identify_url'] = $url;
            $q = wp_parse_url($url, PHP_URL_QUERY);
            if ($q) { $payload['identify_qs'] = $q; }
        }
    }
    if (empty($payload['event_id'])) { $payload['event_id'] = wp_generate_uuid4(); }
    if (empty($payload['occurred_at'])) { $payload['occurred_at'] = gmdate('c'); }
    return apply_filters('lls_slee_payload', $payload);
}

/* -------------------------------------------------------------------------
 * ZERO-CODE HUB INTEGRATION
 * Point HUB's existing EME bridge (lls_hub_eme_emit) at {LLS_SLEE_URL}/v1/event.
 * This filter signs + enriches HUB's outgoing request in flight — no HUB edits needed.
 * ---------------------------------------------------------------------- */
add_filter('http_request_args', function ($args, $url) {
    $ev = lls_slee_event_url();
    if (!$ev || strpos((string) $url, $ev) !== 0 || !lls_slee_ready()) { return $args; }
    $headers = isset($args['headers']) && is_array($args['headers']) ? $args['headers'] : array();
    if (!empty($headers['X-LLS-Signature'])) { return $args; } // already signed by this plugin

    $body = isset($args['body']) ? $args['body'] : '';
    $data = is_array($body) ? $body : json_decode((string) $body, true);
    if (!is_array($data)) { return $args; }

    $json = wp_json_encode(lls_slee_enrich($data));
    $args['body']    = $json;
    $args['headers'] = array_merge($headers, array('Content-Type' => 'application/json'), lls_slee_sign($json));
    if (empty($args['timeout']) || $args['timeout'] > 5) { $args['timeout'] = 5; }
    return $args;
}, 10, 2);

/** Anything that fails (Worker unreachable, 5xx) goes to the outbox and is retried by WP-Cron. */
add_action('http_api_debug', function ($response, $context, $class, $args, $url) {
    $ev = lls_slee_event_url();
    if (!$ev || strpos((string) $url, $ev) !== 0 || !empty($args['headers']['X-LLS-Retry'])) { return; }
    $code = is_wp_error($response) ? 0 : (int) wp_remote_retrieve_response_code($response);
    if ($code === 0 || $code >= 500 || $code === 429) {
        lls_slee_outbox_add(is_string($args['body']) ? $args['body'] : wp_json_encode($args['body']),
            is_wp_error($response) ? $response->get_error_message() : 'HTTP ' . $code);
    }
}, 10, 5);

/* -------------------------------------------------------------------------
 * Direct API for any LLS plugin (SAH, GloType, Power Move, Freedom Tax, Datēbase):
 *   lls_slee_emit('sah_quiz', $email, array('SAH_SCORE' => 12, 'SAH_STATUS' => '…'));
 *   do_action('lls_slee_emit', 'power_move_optin', $email, array('POWER_MOVE' => 'Wallet'));
 * ---------------------------------------------------------------------- */
function lls_slee_emit($type, $email, $attrs = array(), $extra = array()) {
    if (!lls_slee_ready() || !is_email($email)) { return false; }
    $payload = lls_slee_enrich(array_merge(array(
        'type'       => (string) $type,
        'email'      => strtolower(trim($email)),
        'attributes' => (array) $attrs,
        'source_system' => 'wp',
    ), (array) $extra));
    $json = wp_json_encode($payload);
    $res  = wp_remote_post(lls_slee_event_url(), array(
        'timeout' => 4,
        'headers' => array_merge(array('Content-Type' => 'application/json'), lls_slee_sign($json)),
        'body'    => $json,
    ));
    $code = is_wp_error($res) ? 0 : (int) wp_remote_retrieve_response_code($res);
    return $code >= 200 && $code < 300;
}
add_action('lls_slee_emit', 'lls_slee_emit', 10, 4);

/* -------------------------------------------------------------------------
 * Outbox (survives Worker/network blips)
 * ---------------------------------------------------------------------- */
function lls_slee_table() { global $wpdb; return $wpdb->prefix . LLS_SLEE_OUTBOX_TABLE; }

function lls_slee_outbox_add($body, $error = '') {
    global $wpdb;
    $wpdb->insert(lls_slee_table(), array(
        'body' => (string) $body, 'attempts' => 0, 'last_error' => substr((string) $error, 0, 250),
        'next_at' => gmdate('Y-m-d H:i:s', time() + 300), 'created_at' => gmdate('Y-m-d H:i:s'),
    ));
}

function lls_slee_outbox_flush() {
    if (!lls_slee_ready()) { return; }
    global $wpdb;
    $t    = lls_slee_table();
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM {$t} WHERE next_at <= %s AND attempts < 12 ORDER BY id ASC LIMIT 25", gmdate('Y-m-d H:i:s')
    ));
    foreach ((array) $rows as $row) {
        $data = json_decode($row->body, true);
        $json = is_array($data) ? wp_json_encode(lls_slee_enrich($data)) : $row->body;
        $res  = wp_remote_post(lls_slee_event_url(), array(
            'timeout' => 8,
            'headers' => array_merge(array('Content-Type' => 'application/json', 'X-LLS-Retry' => '1'), lls_slee_sign($json)),
            'body'    => $json,
        ));
        $code = is_wp_error($res) ? 0 : (int) wp_remote_retrieve_response_code($res);
        if ($code >= 200 && $code < 300) {
            $wpdb->delete($t, array('id' => $row->id));
        } elseif ($code >= 400 && $code < 500 && $code !== 429) {
            $wpdb->update($t, array('attempts' => 99, 'last_error' => 'HTTP ' . $code . ' (dead-letter)'), array('id' => $row->id));
        } else {
            $n = (int) $row->attempts + 1;
            $wpdb->update($t, array(
                'attempts' => $n,
                'last_error' => is_wp_error($res) ? substr($res->get_error_message(), 0, 250) : 'HTTP ' . $code,
                'next_at' => gmdate('Y-m-d H:i:s', time() + min(43200, 300 * (2 ** $n))),
            ), array('id' => $row->id));
        }
    }
}

add_filter('cron_schedules', function ($s) {
    $s['lls_slee_5min'] = array('interval' => 300, 'display' => 'Every 5 minutes (LLS SLEE)');
    return $s;
});
add_action('lls_slee_flush', 'lls_slee_outbox_flush');

register_activation_hook(__FILE__, function () {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = lls_slee_table();
    $c = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE {$t} (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        body longtext NOT NULL,
        attempts int(11) NOT NULL DEFAULT 0,
        last_error varchar(255) NULL,
        next_at datetime NOT NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY next_at (next_at)
    ) {$c};");
    if (!wp_next_scheduled('lls_slee_flush')) { wp_schedule_event(time() + 60, 'lls_slee_5min', 'lls_slee_flush'); }
});
register_deactivation_hook(__FILE__, function () { wp_clear_scheduled_hook('lls_slee_flush'); });

/* -------------------------------------------------------------------------
 * SLEE → HUB feedback: POST /wp-json/lls-slee/v1/feedback (HMAC-verified)
 * ---------------------------------------------------------------------- */
add_action('rest_api_init', function () {
    register_rest_route('lls-slee/v1', '/feedback', array(
        'methods'             => 'POST',
        'permission_callback' => '__return_true', // auth = HMAC signature below
        'callback'            => 'lls_slee_feedback',
    ));
});

function lls_slee_feedback(WP_REST_Request $req) {
    $body = $req->get_body();
    $ts   = (string) $req->get_header('x_lls_timestamp');
    $sig  = (string) $req->get_header('x_lls_signature');
    $exp  = 'sha256=' . hash_hmac('sha256', $ts . '.' . $body, (string) lls_slee_cfg('secret'));
    if (!lls_slee_cfg('secret') || !$ts || abs(time() - (int) $ts) > 300 || !hash_equals($exp, $sig)) {
        return new WP_REST_Response(array('ok' => false, 'error' => 'bad_signature'), 401);
    }
    $p = json_decode($body, true);
    if (!is_array($p) || empty($p['email'])) {
        return new WP_REST_Response(array('ok' => false, 'error' => 'invalid_payload'), 400);
    }

    do_action('lls_slee_feedback', $p); // hook for any plugin
    $hub = apply_filters('lls_slee_feedback_to_hub', null, $p);
    if ($hub === null) { $hub = lls_slee_default_hub_ingest($p); }
    return new WP_REST_Response(array('ok' => true, 'hub' => $hub), 200);
}

/**
 * Default: hand the engagement event to HUB's own REST ingest route (internal dispatch, no HTTP hop).
 * If HUB's ingest needs a different shape, override with the 'lls_slee_feedback_to_hub' filter.
 */
function lls_slee_default_hub_ingest(array $p) {
    $routes = rest_get_server()->get_routes();
    $type   = (string) $p['type']; // email.clicked | email.unsubscribed | email.bounced | email.complained | email.sunset
    foreach (array('/lls-hub/v1/ingest', '/lls-hub/v1/event', '/lls-hub/v1/events') as $route) {
        if (!isset($routes[$route])) { continue; }
        $r = new WP_REST_Request('POST', $route);
        $r->set_header('content-type', 'application/json');
        $r->set_body(wp_json_encode(array(
            'email'      => $p['email'],
            'hub_id'     => isset($p['hub_id']) ? $p['hub_id'] : null,
            'event'      => str_replace('.', '_', $type),      // email_clicked …
            'source'     => 'slee',
            'attributes' => array(
                'LAST_EMAIL_EVENT'    => $type,
                'LAST_EMAIL_EVENT_AT' => isset($p['occurred_at']) ? $p['occurred_at'] : gmdate('c'),
                'CIA_TIER'            => isset($p['data']['cia_tier']) ? $p['data']['cia_tier'] : null,
            ),
            'data'       => isset($p['data']) ? $p['data'] : array(),
        )));
        $res = rest_do_request($r);
        return array('route' => $route, 'status' => $res->get_status());
    }
    return 'no_hub_ingest_route';
}

/* -------------------------------------------------------------------------
 * Settings → LLS SLEE
 * ---------------------------------------------------------------------- */
add_action('admin_menu', function () {
    add_options_page('LLS SLEE', 'LLS SLEE', 'manage_options', 'lls-slee', 'lls_slee_settings_page');
});
add_action('admin_init', function () {
    register_setting('lls_slee', 'lls_slee_settings', array('sanitize_callback' => function ($v) {
        return array(
            'enabled' => !empty($v['enabled']),
            'url'     => esc_url_raw(isset($v['url']) ? trim($v['url']) : ''),
            'secret'  => isset($v['secret']) ? sanitize_text_field($v['secret']) : '',
        );
    }));
});
add_action('admin_post_lls_slee_test', function () {
    if (!current_user_can('manage_options')) { wp_die('Forbidden'); }
    check_admin_referer('lls_slee_test');
    $u  = wp_get_current_user();
    $ok = lls_slee_emit('lls_hub_optin', $u->user_email, array('PAGE_SOURCE' => 'slee_bridge_test', 'FIRSTNAME' => $u->first_name));
    wp_safe_redirect(add_query_arg('lls_slee_test', $ok ? 'ok' : 'fail', admin_url('options-general.php?page=lls-slee')));
    exit;
});

function lls_slee_settings_page() {
    global $wpdb;
    $o       = get_option('lls_slee_settings', array());
    $t       = lls_slee_table();
    $pending = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$t} WHERE attempts < 12");
    $dead    = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$t} WHERE attempts >= 12");
    $last    = $wpdb->get_var("SELECT last_error FROM {$t} ORDER BY id DESC LIMIT 1");
    ?>
    <div class="wrap">
      <h1>LLS SLEE Bridge</h1>
      <?php if (isset($_GET['lls_slee_test'])) : ?>
        <div class="notice notice-<?php echo $_GET['lls_slee_test'] === 'ok' ? 'success' : 'error'; ?>"><p>
          Test event <?php echo $_GET['lls_slee_test'] === 'ok' ? 'accepted by SLEE ✅' : 'failed ❌ — check URL/secret'; ?></p></div>
      <?php endif; ?>
      <p>HUB → SLEE event URL: <code><?php echo esc_html(lls_slee_event_url() ?: '(not set)'); ?></code><br>
         SLEE → HUB feedback URL: <code><?php echo esc_html(rest_url('lls-slee/v1/feedback')); ?></code></p>
      <form method="post" action="options.php">
        <?php settings_fields('lls_slee'); ?>
        <table class="form-table">
          <tr><th>Enabled</th><td><label><input type="checkbox" name="lls_slee_settings[enabled]" value="1" <?php checked(!empty($o['enabled']) || defined('LLS_SLEE_ENABLED')); ?> <?php disabled(defined('LLS_SLEE_ENABLED')); ?>> Send events to SLEE</label></td></tr>
          <tr><th>SLEE base URL</th><td><input class="regular-text" name="lls_slee_settings[url]" value="<?php echo esc_attr(isset($o['url']) ? $o['url'] : ''); ?>" placeholder="https://slee.legallysingle.com" <?php disabled(defined('LLS_SLEE_URL')); ?>>
            <?php if (defined('LLS_SLEE_URL')) echo '<p class="description">Set in wp-config.php</p>'; ?></td></tr>
          <tr><th>Shared secret</th><td><input class="regular-text" type="password" name="lls_slee_settings[secret]" value="<?php echo esc_attr(isset($o['secret']) ? $o['secret'] : ''); ?>" <?php disabled(defined('LLS_SLEE_SECRET')); ?>>
            <p class="description">Must equal the Worker's <code>HUB_SHARED_SECRET</code>. Prefer <code>define('LLS_SLEE_SECRET', '…')</code> in wp-config.php.</p></td></tr>
        </table>
        <?php submit_button(); ?>
      </form>
      <h2>Health</h2>
      <p>Outbox pending: <strong><?php echo $pending; ?></strong> · Dead-letter: <strong><?php echo $dead; ?></strong>
        <?php if ($last) echo ' · Last error: <code>' . esc_html($last) . '</code>'; ?><br>
        HUB identify links: <?php echo function_exists('lls_hub_generate_identify_url') ? '✅ lls_hub_generate_identify_url() found' : '⚠️ not found (CTAs will not restore identity)'; ?></p>
      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <input type="hidden" name="action" value="lls_slee_test"><?php wp_nonce_field('lls_slee_test'); ?>
        <?php submit_button('Send test event (as me)', 'secondary'); ?>
      </form>
    </div>
    <?php
}
