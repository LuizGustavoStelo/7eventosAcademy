<?php

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_Admin
{
    private const OPTION_KEY = 'seven_academy_settings';

    public static function init(): void
    {
        add_action('admin_menu', [self::class, 'register_menu']);
        add_action('admin_init', [self::class, 'register_settings']);
    }

    public static function register_menu(): void
    {
        add_menu_page(
            '7academy',
            '7academy',
            'manage_options',
            'seven-academy',
            [self::class, 'render_page'],
            'dashicons-welcome-learn-more',
            58
        );
    }

    public static function register_settings(): void
    {
        register_setting(
            'seven_academy_settings_group',
            self::OPTION_KEY,
            [
                'type' => 'array',
                'sanitize_callback' => [self::class, 'sanitize_settings'],
                'default' => self::default_settings(),
            ]
        );

        add_settings_section(
            'seven_academy_main_section',
            'Configuração de conexão',
            '__return_false',
            'seven-academy'
        );

        add_settings_field(
            'base_url',
            'URL base da Academy',
            [self::class, 'render_base_url_field'],
            'seven-academy',
            'seven_academy_main_section'
        );

        add_settings_field(
            'health_path',
            'Rota de health check',
            [self::class, 'render_health_path_field'],
            'seven-academy',
            'seven_academy_main_section'
        );

        add_settings_field(
            'tenant_slug',
            'Tenant público (opcional)',
            [self::class, 'render_tenant_slug_field'],
            'seven-academy',
            'seven_academy_main_section'
        );
    }

    public static function sanitize_settings(array $input): array
    {
        $defaults = self::default_settings();

        $base_url = isset($input['base_url']) ? esc_url_raw(trim((string) $input['base_url'])) : $defaults['base_url'];
        $health_path = isset($input['health_path']) ? trim((string) $input['health_path']) : $defaults['health_path'];
        $tenant_slug = isset($input['tenant_slug']) ? sanitize_text_field((string) $input['tenant_slug']) : '';

        if ($health_path === '' || $health_path[0] !== '/') {
            $health_path = '/api/health';
        }

        return [
            'base_url' => rtrim($base_url, '/'),
            'health_path' => $health_path,
            'tenant_slug' => $tenant_slug,
        ];
    }

    public static function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        $settings = self::get_settings();
        $connection = self::check_connection($settings['base_url'], $settings['health_path']);
        ?>
        <div class="wrap">
            <h1>7academy</h1>
            <p>Painel administrativo do plugin de integração com a Academy.</p>

            <table class="widefat striped" style="max-width: 840px; margin: 16px 0;">
                <tbody>
                    <tr>
                        <td style="width: 240px;"><strong>Status de conexão</strong></td>
                        <td>
                            <?php if ($connection['ok']) : ?>
                                <span style="color: #146c2e;"><strong>Conectado</strong></span>
                            <?php else : ?>
                                <span style="color: #b42318;"><strong>Indisponível</strong></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong>Versão do plugin</strong></td>
                        <td><?php echo esc_html(SEVEN_ACADEMY_VERSION); ?></td>
                    </tr>
                    <tr>
                        <td><strong>URL da Academy</strong></td>
                        <td><?php echo esc_html($settings['base_url'] ?: 'Não configurada'); ?></td>
                    </tr>
                    <tr>
                        <td><strong>Detalhe técnico</strong></td>
                        <td><?php echo esc_html($connection['message']); ?></td>
                    </tr>
                </tbody>
            </table>

            <form method="post" action="options.php" style="max-width: 840px;">
                <?php
                settings_fields('seven_academy_settings_group');
                do_settings_sections('seven-academy');
                submit_button('Salvar configurações');
                ?>
            </form>
        </div>
        <?php
    }

    public static function render_base_url_field(): void
    {
        $settings = self::get_settings();
        ?>
        <input
            type="url"
            class="regular-text"
            name="<?php echo esc_attr(self::OPTION_KEY); ?>[base_url]"
            value="<?php echo esc_attr($settings['base_url']); ?>"
            placeholder="https://academy.7eventos.com"
        />
        <p class="description">Domínio principal da Academy, sem barra no final.</p>
        <?php
    }

    public static function render_health_path_field(): void
    {
        $settings = self::get_settings();
        ?>
        <input
            type="text"
            class="regular-text"
            name="<?php echo esc_attr(self::OPTION_KEY); ?>[health_path]"
            value="<?php echo esc_attr($settings['health_path']); ?>"
            placeholder="/api/health"
        />
        <p class="description">Rota usada para validar disponibilidade da API.</p>
        <?php
    }

    public static function render_tenant_slug_field(): void
    {
        $settings = self::get_settings();
        ?>
        <input
            type="text"
            class="regular-text"
            name="<?php echo esc_attr(self::OPTION_KEY); ?>[tenant_slug]"
            value="<?php echo esc_attr($settings['tenant_slug']); ?>"
            placeholder="instituicao-x"
        />
        <p class="description">Identificador público da instituição, quando necessário.</p>
        <?php
    }

    public static function get_settings(): array
    {
        $saved = get_option(self::OPTION_KEY, []);
        if (!is_array($saved)) {
            $saved = [];
        }

        return wp_parse_args($saved, self::default_settings());
    }

    public static function default_settings(): array
    {
        return [
            'base_url' => 'https://academy.7eventos.com',
            'health_path' => '/api/health',
            'tenant_slug' => '',
        ];
    }

    private static function check_connection(string $base_url, string $health_path): array
    {
        if ($base_url === '') {
            return [
                'ok' => false,
                'message' => 'URL base não configurada.',
            ];
        }

        $endpoint = rtrim($base_url, '/') . $health_path;
        $response = wp_remote_get(
            $endpoint,
            [
                'timeout' => 8,
                'headers' => ['Accept' => 'application/json'],
            ]
        );

        if (is_wp_error($response)) {
            return [
                'ok' => false,
                'message' => 'Erro de conexão: ' . $response->get_error_message(),
            ];
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        if ($status >= 200 && $status < 300) {
            return [
                'ok' => true,
                'message' => 'Conexão validada em ' . $endpoint . ' (HTTP ' . $status . ').',
            ];
        }

        return [
            'ok' => false,
            'message' => 'Endpoint respondeu HTTP ' . $status . ': ' . $endpoint,
        ];
    }
}
