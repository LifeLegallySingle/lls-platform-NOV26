<?php
/**
 * Plugin Name:       LLS Nudge
 * Description:       Small, SEO-safe site-wide nudge (desktop slide-in card, mobile bottom bar). First use: the 2026 Freedom Tax™ ("singles tax") calculator.
 * Version:           1.0.1
 * Author:            Life Legally Single™
 * License:           GPL-2.0-or-later
 * Text Domain:       lls-nudge
 */

if (!defined('ABSPATH')) { exit; }

define('LLS_NUDGE_VERSION', '1.0.1');

/**
 * Default config. Override any key with the `lls_nudge_config` filter.
 * SEO-safe rules baked in: never full-screen, never on load, never blocks content,
 * injected by JS after a delay or scroll (not part of the page's crawlable content).
 */
function lls_nudge_config() {
    $c = array(
        'id'          => 'ftax_2026',
        'text_before' => 'What’s your 2026 “singles tax”?',
        'text_sub'    => 'Your Freedom Tax™, in 2 minutes.',
        'text_cta'    => 'Check it for Free',
        'url'         => home_url('/freedom-tax-calculator/'),
        'utm'         => 'utm_source=site&utm_medium=nudge&utm_campaign=ftax_nudge',
        'hide_paths'  => array('/freedom-tax-calculator/'),   // never show here
        'done_product'=> 'freedom_tax',                        // HUB product that means "already did it"
        'delay_ms'    => 1200,                                 // show this long after the full page has loaded
        'cap_days'    => 7,                                    // at most once a week per visitor
        'done_days'   => 60,                                   // hide this long after visiting the calculator
        'accent'      => '#6427b0',                            // brand purple
    );
    return apply_filters('lls_nudge_config', $c);
}

/* ---------- Settings: one switch (off = admins-only preview) ---------- */
add_action('admin_init', function () {
    register_setting('lls_nudge', 'lls_nudge_live', array('type' => 'boolean', 'default' => false, 'sanitize_callback' => 'rest_sanitize_boolean'));
});
add_action('admin_menu', function () {
    add_options_page('LLS Nudge', 'LLS Nudge', 'manage_options', 'lls-nudge', function () {
        $c = lls_nudge_config(); ?>
        <div class="wrap"><h1>LLS Nudge</h1>
        <form method="post" action="options.php"><?php settings_fields('lls_nudge'); ?>
        <p><label><input type="checkbox" name="lls_nudge_live" value="1" <?php checked(get_option('lls_nudge_live')); ?>>
        <strong>Live for all visitors</strong></label></p>
        <p class="description">Off = only logged-in admins see it (preview). Add <code>?lls_nudge=preview</code> to any page to see it right away.</p>
        <?php submit_button(); ?></form>
        <h2>Current nudge</h2>
        <p><strong><?php echo esc_html($c['text_before']); ?></strong> <?php echo esc_html($c['text_cta']); ?></p>
        <p>Links to <code><?php echo esc_html($c['url']); ?></code> with <code><?php echo esc_html($c['utm']); ?></code></p>
        </div><?php
    });
});

/* ---------- Should this visitor see it? ---------- */
function lls_nudge_should_render() {
    if (is_admin() || wp_doing_ajax() || is_feed() || is_embed() || (defined('REST_REQUEST') && REST_REQUEST)) { return false; }
    $c = lls_nudge_config();
    $live = (bool) get_option('lls_nudge_live', false);
    if (!$live && !current_user_can('manage_options')) { return false; }

    $path = trailingslashit(wp_parse_url(isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '/', PHP_URL_PATH) ?: '/');
    foreach ($c['hide_paths'] as $p) {
        if (stripos($path, trailingslashit($p)) === 0) { return false; }
    }
    // Logged-in member who already used the product (HUB knows): hide.
    if (is_user_logged_in() && function_exists('lls_hub_get_user_state')) {
        $u = wp_get_current_user();
        $state = lls_hub_get_user_state($u->user_email);
        $products = is_array($state) && isset($state['products']) ? (array) $state['products'] : array();
        if (in_array($c['done_product'], $products, true)) { return false; }
    }
    return true;
}

/* ---------- Calculator page: remember the visit so the nudge stays away ---------- */
add_action('wp_footer', function () {
    $c = lls_nudge_config();
    $path = trailingslashit(wp_parse_url(isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '/', PHP_URL_PATH) ?: '/');
    foreach ($c['hide_paths'] as $p) {
        if (stripos($path, trailingslashit($p)) === 0) {
            printf("<script>try{localStorage.setItem('lls_nudge_done_%s',String(Date.now()))}catch(e){}</script>\n", esc_js($c['id']));
            return;
        }
    }
}, 50);

/* ---------- The nudge (injected by JS after delay/scroll; nothing in page content) ---------- */
add_action('wp_footer', function () {
    if (!lls_nudge_should_render()) { return; }
    $c = lls_nudge_config();
    $href = $c['url'] . (strpos($c['url'], '?') === false ? '?' : '&') . $c['utm'];
    $cfg = array(
        'id'    => $c['id'],
        'href'  => esc_url_raw($href),
        'a'     => $c['text_before'],
        'sub'   => $c['text_sub'],
        'b'     => $c['text_cta'],
        'delay' => (int) $c['delay_ms'],
        'cap'   => (int) $c['cap_days'],
        'done'  => (int) $c['done_days'],
        'force' => isset($_GET['lls_nudge']) && $_GET['lls_nudge'] === 'preview',
    );
    $accent = sanitize_hex_color($c['accent']) ?: '#6427b0';
    ?>
<style id="lls-nudge-css">
#lls-nudge{position:fixed;z-index:99990;right:20px;bottom:20px;width:320px;background:<?php echo $accent; ?>;color:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:inherit;padding:18px 20px 18px 20px;box-sizing:border-box;transform:translateY(140%);opacity:0;transition:transform .45s ease,opacity .45s ease}
#lls-nudge.lls-in{transform:translateY(0);opacity:1}
#lls-nudge .lls-nudge-h{display:block;font-size:17px;font-weight:700;line-height:1.3;margin:0 22px 4px 0}
#lls-nudge .lls-nudge-s{display:block;font-size:14px;line-height:1.4;opacity:.92;margin:0 0 12px}
#lls-nudge a.lls-nudge-btn{display:block;text-align:center;background:#fff;color:<?php echo $accent; ?>;font-weight:700;font-size:15px;line-height:1;padding:12px 16px;border-radius:999px;text-decoration:none}
#lls-nudge a.lls-nudge-btn:hover,#lls-nudge a.lls-nudge-btn:focus{box-shadow:0 0 0 3px rgba(255,255,255,.45)}
#lls-nudge button{position:absolute;top:6px;right:8px;background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:6px;opacity:.85}
#lls-nudge button:hover,#lls-nudge button:focus{opacity:1}
@media (max-width:600px){
 #lls-nudge{left:0;right:0;bottom:0;width:auto;border-radius:0;padding:10px 40px 10px 14px;display:flex;align-items:center;gap:10px}
 #lls-nudge .lls-nudge-txt{flex:1;min-width:0}
 #lls-nudge .lls-nudge-h{font-size:14px;margin:0}
 #lls-nudge .lls-nudge-s{display:none}
 #lls-nudge a.lls-nudge-btn{flex:none;font-size:13px;padding:10px 14px;white-space:nowrap}
}
@media (prefers-reduced-motion:reduce){#lls-nudge{transition:none}}
</style>
<script id="lls-nudge-js">
(function(){
  var C=<?php echo wp_json_encode($cfg); ?>, K='lls_nudge_'+C.id, D='lls_nudge_done_'+C.id, day=864e5;
  function get(k){try{return Number(localStorage.getItem(k)||0)}catch(e){return 0}}
  function set(k){try{localStorage.setItem(k,String(Date.now()))}catch(e){}}
  if(!C.force){
    if(get(K) && Date.now()-get(K)<C.cap*day) return;
    if(get(D) && Date.now()-get(D)<C.done*day) return;
  }
  var shown=false;
  function show(){
    if(shown) return; shown=true; set(K);
    var w=document.createElement('aside'); w.id='lls-nudge'; w.setAttribute('aria-label','Freedom Tax calculator');
    var txt=document.createElement('div'); txt.className='lls-nudge-txt';
    var hh=document.createElement('span'); hh.className='lls-nudge-h'; hh.textContent=C.a;
    var ss=document.createElement('span'); ss.className='lls-nudge-s'; ss.textContent=C.sub;
    txt.appendChild(hh); txt.appendChild(ss);
    var a=document.createElement('a'); a.className='lls-nudge-btn'; a.href=C.href; a.textContent=C.b;
    a.addEventListener('click',function(){set(D)});
    var x=document.createElement('button'); x.type='button'; x.setAttribute('aria-label','Close'); x.innerHTML='&times;';
    x.addEventListener('click',function(){w.classList.remove('lls-in'); setTimeout(function(){w.remove()},500)});
    w.appendChild(txt); w.appendChild(a); w.appendChild(x); document.body.appendChild(w);
    requestAnimationFrame(function(){requestAnimationFrame(function(){w.classList.add('lls-in')})});
  }
  // Show after the FULL page has loaded (images, fonts), so it never delays or shifts content.
  function go(){ setTimeout(show, C.force ? 300 : C.delay); }
  if(document.readyState==='complete'){ go(); } else { window.addEventListener('load',go,{once:true}); }
})();
</script>
<?php
}, 60);
