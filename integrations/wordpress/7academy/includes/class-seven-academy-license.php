<?php

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_License
{
    private const CACHE_KEY = 'seven_academy_license_validation_cache';

    public static function init(): void
    {
        add_action('admin_post_seven_academy_activate_license',   [self::class, 'handle_activate_license']);
        add_action('admin_post_seven_academy_deactivate_license', [self::class, 'handle_deactivate_license']);
    }

    public static function handle_activate_license(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die('Acesso negado.');
        }

        check_admin_referer('seven_academy_activate_license');

        $settings   = Seven_Academy_Admin::get_settings();
        $postedKey  = isset($_POST['license_key']) ? sanitize_text_field(wp_unslash((string) $_POST['license_key'])) : '';
        if ($postedKey !== '') {
            $settings['license_key'] = $postedKey;
            $settings['activation_token'] = '';
            $settings['license_activated_at'] = '';
            Seven_Academy_Admin::save_settings($settings);
        }

        $licenseKey = trim((string) ($settings['license_key'] ?? ''));
        $baseUrl    = rtrim((string) SEVEN_ACADEMY_API_BASE_URL, '/');

        if ($licenseKey === '' || $baseUrl === '') {
            self::redirect_with_notice('error', 'Informe a chave de licenca antes de ativar.');
        }

        $payload = [
            'licenseKey'    => $licenseKey,
            'domain'        => self::current_domain(),
            'siteUrl'       => home_url('/'),
            'pluginVersion' => SEVEN_ACADEMY_VERSION,
        ];

        $response = Seven_Academy_Api_Client::post_json($baseUrl, '/api/wordpress/license/activate', $payload);

        if (!$response['ok'] || !is_array($response['data']) || empty($response['data']['activationToken'])) {
            $message = $response['message'] ?: 'Nao foi possivel ativar a licenca.';
            self::redirect_with_notice('error', $message);
        }

        $settings['activation_token']    = sanitize_text_field((string) $response['data']['activationToken']);
        $settings['license_activated_at'] = current_time('mysql');
        Seven_Academy_Admin::save_settings($settings);

        delete_transient(self::CACHE_KEY);
        Seven_Academy_Updater::clear_update_cache();
        self::redirect_with_notice('success', 'Licenca ativada com sucesso.');
    }

    public static function handle_deactivate_license(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die('Acesso negado.');
        }

        check_admin_referer('seven_academy_deactivate_license');
        $settings                        = Seven_Academy_Admin::get_settings();
        $settings['activation_token']    = '';
        $settings['license_activated_at'] = '';
        Seven_Academy_Admin::save_settings($settings);

        delete_transient(self::CACHE_KEY);
        Seven_Academy_Updater::clear_update_cache();
        self::redirect_with_notice('success', 'Licenca removida do site.');
    }

    public static function get_license_status(array $settings): array
    {
        $cached = get_transient(self::CACHE_KEY);
        if (is_array($cached)) {
            return $cached;
        }

        $token   = trim((string) ($settings['activation_token'] ?? ''));

        if ($token === '') {
            return [
                'active'  => false,
                'message' => 'Licenca nao ativada.',
            ];
        }

        $payload = [
            'activationToken' => $token,
            'domain'          => self::current_domain(),
            'siteUrl'         => home_url('/'),
        ];

        $response = Seven_Academy_Api_Client::post_json(SEVEN_ACADEMY_API_BASE_URL, '/api/wordpress/license/validate', $payload);
        if (!$response['ok'] || !is_array($response['data']) || empty($response['data']['valid'])) {
            $result = [
                'active'  => false,
                'message' => 'Licenca invalida ou nao validada.',
            ];
            set_transient(self::CACHE_KEY, $result, MINUTE_IN_SECONDS * 10);
            return $result;
        }

        $result = [
            'active'  => true,
            'message' => 'Licenca ativa para o dominio atual.',
        ];
        set_transient(self::CACHE_KEY, $result, MINUTE_IN_SECONDS * 10);
        return $result;
    }

    private static function current_domain(): string
    {
        $host = wp_parse_url(home_url('/'), PHP_URL_HOST);
        return is_string($host) ? strtolower($host) : '';
    }

    private static function redirect_with_notice(string $type, string $message): void
    {
        $location = add_query_arg(
            [
                'page'                        => 'seven-academy',
                'seven_academy_notice_type'   => $type,
                'seven_academy_notice_message' => rawurlencode($message),
            ],
            admin_url('admin.php')
        );

        if (headers_sent()) {
            echo '<script type="text/javascript">window.location.href="' . esc_js($location) . '";</script>';
        } else {
            wp_redirect($location);
        }
        exit;
    }
}
