<?php

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_Api_Client
{
    /**
     * Timeout in seconds for POST requests.
     * Keep it short to avoid blocking PHP execution.
     */
    private const TIMEOUT_POST = 5;

    /**
     * Timeout in seconds for GET requests.
     */
    private const TIMEOUT_GET = 4;

    public static function post_json(string $baseUrl, string $path, array $payload): array
    {
        $endpoint = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');

        $response = wp_remote_post(
            $endpoint,
            [
                'timeout'    => self::TIMEOUT_POST,
                'blocking'   => true,
                'headers'    => [
                    'Accept'       => 'application/json',
                    'Content-Type' => 'application/json',
                ],
                'body' => wp_json_encode($payload),
            ]
        );

        if (is_wp_error($response)) {
            return [
                'ok'      => false,
                'status'  => 0,
                'message' => $response->get_error_message(),
                'data'    => null,
            ];
        }

        $status  = (int) wp_remote_retrieve_response_code($response);
        $body    = (string) wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);

        $message = '';
        if (is_array($decoded) && isset($decoded['message'])) {
            $message = is_array($decoded['message'])
                ? implode(', ', $decoded['message'])
                : (string) $decoded['message'];
        }

        return [
            'ok'      => $status >= 200 && $status < 300,
            'status'  => $status,
            'message' => $message,
            'data'    => is_array($decoded) ? $decoded : null,
        ];
    }

    public static function get_json(string $baseUrl, string $path): array
    {
        $endpoint = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');

        $response = wp_remote_get(
            $endpoint,
            [
                'timeout'  => self::TIMEOUT_GET,
                'blocking' => true,
                'headers'  => [
                    'Accept' => 'application/json',
                ],
            ]
        );

        if (is_wp_error($response)) {
            return [
                'ok'      => false,
                'status'  => 0,
                'message' => $response->get_error_message(),
                'data'    => null,
            ];
        }

        $status  = (int) wp_remote_retrieve_response_code($response);
        $body    = (string) wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);

        $message = '';
        if (is_array($decoded) && isset($decoded['message'])) {
            $message = is_array($decoded['message'])
                ? implode(', ', $decoded['message'])
                : (string) $decoded['message'];
        }

        return [
            'ok'      => $status >= 200 && $status < 300,
            'status'  => $status,
            'message' => $message,
            'data'    => is_array($decoded) ? $decoded : null,
        ];
    }
}
