<?php

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_Api_Client
{
    public static function post_json(string $baseUrl, string $path, array $payload): array
    {
        $endpoint = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');

        $response = wp_remote_post(
            $endpoint,
            [
                'timeout' => 12,
                'headers' => [
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
                'timeout' => 8,
                'headers' => [
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
