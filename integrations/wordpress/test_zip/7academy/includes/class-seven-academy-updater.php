<?php

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_Updater
{
    private const UPDATE_CACHE_KEY = 'seven_academy_update_cache';
    private const UPDATE_CACHE_TTL = 900;

    public static function init(): void
    {
        add_filter('pre_set_site_transient_update_plugins', [self::class, 'inject_update_information']);
        add_filter('plugins_api', [self::class, 'inject_plugin_information'], 20, 3);
    }

    public static function inject_update_information($transient)
    {
        if (!is_object($transient) || empty($transient->checked)) {
            return $transient;
        }

        $pluginBasename = plugin_basename(SEVEN_ACADEMY_PLUGIN_FILE);
        if (!isset($transient->checked[$pluginBasename])) {
            return $transient;
        }

        $update = self::fetch_update_data();
        if (!$update['ok'] || empty($update['data']['updateAvailable'])) {
            return $transient;
        }

        $data = $update['data'];
        $item = (object) [
            'slug' => '7academy',
            'plugin' => $pluginBasename,
            'new_version' => (string) $data['latestVersion'],
            'url' => isset($data['changelogUrl']) ? (string) $data['changelogUrl'] : '',
            'package' => (string) $data['packageUrl'],
            'tested' => isset($data['requiresWordpress']) ? (string) $data['requiresWordpress'] : '',
            'requires_php' => isset($data['requiresPhp']) ? (string) $data['requiresPhp'] : '',
        ];

        $transient->response[$pluginBasename] = $item;
        return $transient;
    }

    public static function inject_plugin_information($result, $action, $args)
    {
        if ($action !== 'plugin_information' || !isset($args->slug) || $args->slug !== '7academy') {
            return $result;
        }

        $update = self::fetch_update_data();
        if (!$update['ok'] || empty($update['data'])) {
            return $result;
        }

        $data = $update['data'];
        $sections = [
            'description' => 'Plugin de integração entre WordPress e 7Eventos Academy.',
        ];

        if (!empty($data['changelogUrl'])) {
            $sections['changelog'] = 'Changelog: ' . esc_url((string) $data['changelogUrl']);
        }

        return (object) [
            'name' => '7academy',
            'slug' => '7academy',
            'version' => (string) ($data['latestVersion'] ?? SEVEN_ACADEMY_VERSION),
            'author' => '7Eventos',
            'homepage' => 'https://academy.7eventos.com',
            'sections' => $sections,
            'download_link' => (string) ($data['packageUrl'] ?? ''),
        ];
    }

    private static function fetch_update_data(): array
    {
        $cached = get_site_transient(self::UPDATE_CACHE_KEY);
        if (is_array($cached)) {
            return $cached;
        }

        $settings = Seven_Academy_Admin::get_settings();
        $baseUrl = rtrim((string) ($settings['base_url'] ?? ''), '/');
        $token = trim((string) ($settings['activation_token'] ?? ''));
        $domain = wp_parse_url(home_url('/'), PHP_URL_HOST);

        if ($baseUrl === '' || $token === '' || !is_string($domain)) {
            $result = ['ok' => false, 'data' => null];
            set_site_transient(self::UPDATE_CACHE_KEY, $result, self::UPDATE_CACHE_TTL);
            return $result;
        }

        $payload = [
            'activationToken' => $token,
            'domain' => strtolower($domain),
            'siteUrl' => home_url('/'),
            'pluginVersion' => SEVEN_ACADEMY_VERSION,
            'wordpressVersion' => get_bloginfo('version'),
            'phpVersion' => PHP_VERSION,
        ];

        $response = Seven_Academy_Api_Client::post_json(
            $baseUrl,
            '/api/wordpress/updates/check',
            $payload
        );

        $result = [
            'ok' => $response['ok'] && is_array($response['data']),
            'data' => $response['data'],
        ];

        set_site_transient(self::UPDATE_CACHE_KEY, $result, self::UPDATE_CACHE_TTL);
        return $result;
    }
}
