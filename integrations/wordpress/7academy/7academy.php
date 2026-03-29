<?php
/**
 * Plugin Name: 7academy
 * Plugin URI: https://academy.7eventos.com
 * Description: Integra o WordPress ao modulo incorporado seguro da Academy.
 * Version: 1.0.40
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: 7Eventos
 * Author URI: https://7eventos.com
 * License: Proprietary
 * Text Domain: seven-academy
 */

if (!defined('ABSPATH')) {
    exit;
}

define('SEVEN_ACADEMY_VERSION', '1.0.40');
define('SEVEN_ACADEMY_API_BASE_URL', 'https://academy.7eventos.com');
define('SEVEN_ACADEMY_PLUGIN_FILE', __FILE__);
define('SEVEN_ACADEMY_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SEVEN_ACADEMY_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once SEVEN_ACADEMY_PLUGIN_DIR . 'includes/class-seven-academy-admin.php';
require_once SEVEN_ACADEMY_PLUGIN_DIR . 'includes/class-seven-academy-api-client.php';
require_once SEVEN_ACADEMY_PLUGIN_DIR . 'includes/class-seven-academy-license.php';
require_once SEVEN_ACADEMY_PLUGIN_DIR . 'includes/class-seven-academy-shortcodes.php';
require_once SEVEN_ACADEMY_PLUGIN_DIR . 'includes/class-seven-academy-updater.php';

/**
 * On activation, pre-populate all transient caches with empty/safe values.
 * This prevents any blocking HTTP call from happening on the very first
 * admin page load after the plugin is activated.
 */
function seven_academy_activate(): void
{
    // Pre-fill license cache: no license checked yet.
    set_transient('seven_academy_license_validation_cache', ['active' => false, 'message' => 'Licenca nao verificada ainda.'], MINUTE_IN_SECONDS * 2);

    // Pre-fill update cache: no update data yet.
    set_site_transient('seven_academy_update_cache', ['ok' => false, 'data' => null], 900);
}
register_activation_hook(__FILE__, 'seven_academy_activate');

/**
 * On deactivation, clear all our transient caches.
 */
function seven_academy_deactivate(): void
{
    delete_transient('seven_academy_license_validation_cache');
    delete_site_transient('seven_academy_update_cache');
}
register_deactivation_hook(__FILE__, 'seven_academy_deactivate');

function seven_academy_bootstrap(): void
{
    Seven_Academy_Admin::init();
    Seven_Academy_License::init();
    Seven_Academy_Shortcodes::init();
    Seven_Academy_Updater::init();
}

add_action('plugins_loaded', 'seven_academy_bootstrap');
