<?php
/**
 * Plugin Name: 7academy
 * Plugin URI: https://academy.7eventos.com
 * Description: Integra o WordPress ao módulo incorporado seguro da Academy.
 * Version: 1.0.0
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

define('SEVEN_ACADEMY_VERSION', '1.0.0');
define('SEVEN_ACADEMY_PLUGIN_FILE', __FILE__);
define('SEVEN_ACADEMY_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SEVEN_ACADEMY_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once SEVEN_ACADEMY_PLUGIN_DIR . 'includes/class-seven-academy-admin.php';
require_once SEVEN_ACADEMY_PLUGIN_DIR . 'includes/class-seven-academy-shortcodes.php';

function seven_academy_bootstrap(): void
{
    Seven_Academy_Admin::init();
    Seven_Academy_Shortcodes::init();
}

add_action('plugins_loaded', 'seven_academy_bootstrap');
