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

        add_settings_field(
            'license_key',
            'Chave de licença',
            [self::class, 'render_license_key_field'],
            'seven-academy',
            'seven_academy_main_section'
        );
    }

    public static function sanitize_settings(array $input): array
    {
        $defaults = self::default_settings();
        $current = self::get_settings();

        $baseUrl = isset($input['base_url']) ? esc_url_raw(trim((string) $input['base_url'])) : $defaults['base_url'];
        $healthPath = isset($input['health_path']) ? trim((string) $input['health_path']) : $defaults['health_path'];
        $tenantSlug = isset($input['tenant_slug']) ? sanitize_text_field((string) $input['tenant_slug']) : '';
        $licenseKey = isset($input['license_key']) ? sanitize_text_field((string) $input['license_key']) : '';

        if ($healthPath === '' || $healthPath[0] !== '/') {
            $healthPath = '/api/health';
        }

        $activationToken = (string) ($current['activation_token'] ?? '');
        $licenseActivatedAt = (string) ($current['license_activated_at'] ?? '');

        if ($licenseKey !== (string) ($current['license_key'] ?? '')) {
            $activationToken = '';
            $licenseActivatedAt = '';
            delete_transient('seven_academy_license_validation_cache');
            delete_transient('seven_academy_connection_cache');
            delete_site_transient('seven_academy_update_cache');
        }

        return [
            'base_url' => rtrim($baseUrl, '/'),
            'health_path' => $healthPath,
            'tenant_slug' => $tenantSlug,
            'license_key' => $licenseKey,
            'activation_token' => $activationToken,
            'license_activated_at' => $licenseActivatedAt,
        ];
    }

    public static function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        $settings = self::get_settings();
        $connection = self::check_connection($settings['base_url'], $settings['health_path']);
        $licenseStatus = Seven_Academy_License::get_license_status($settings);
        $notice = self::read_notice();
        ?>
        <div class="wrap">
            <h1>7academy</h1>
            <p>Painel administrativo do plugin de integração com a Academy.</p>

            <?php if ($notice) : ?>
                <div class="notice notice-<?php echo esc_attr($notice['type']); ?> is-dismissible">
                    <p><?php echo esc_html($notice['message']); ?></p>
                </div>
            <?php endif; ?>

            <table class="widefat striped" style="max-width: 960px; margin: 16px 0;">
                <tbody>
                    <tr>
                        <td style="width: 260px;"><strong>Status de conexão</strong></td>
                        <td>
                            <?php if ($connection['ok']) : ?>
                                <span style="color: #146c2e;"><strong>Conectado</strong></span>
                            <?php else : ?>
                                <span style="color: #b42318;"><strong>Indisponível</strong></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <td><strong>Status da licença</strong></td>
                        <td>
                            <?php if (!empty($licenseStatus['active'])) : ?>
                                <span style="color: #146c2e;"><strong>Ativa</strong></span>
                            <?php else : ?>
                                <span style="color: #b42318;"><strong>Inativa</strong></span>
                            <?php endif; ?>
                            <span style="margin-left: 8px;"><?php echo esc_html((string) $licenseStatus['message']); ?></span>
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
                        <td><strong>Domínio do site</strong></td>
                        <td><?php echo esc_html((string) wp_parse_url(home_url('/'), PHP_URL_HOST)); ?></td>
                    </tr>
                    <tr>
                        <td><strong>Detalhe técnico</strong></td>
                        <td><?php echo esc_html($connection['message']); ?></td>
                    </tr>
                </tbody>
            </table>

            <form method="post" action="options.php" style="max-width: 960px;">
                <?php
                settings_fields('seven_academy_settings_group');
                do_settings_sections('seven-academy');
                submit_button('Salvar configurações');
                ?>
            </form>

            <div style="max-width: 960px; margin-top: 20px; display: flex; gap: 8px; align-items: center;">
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <?php wp_nonce_field('seven_academy_activate_license'); ?>
                    <input type="hidden" name="action" value="seven_academy_activate_license" />
                    <?php submit_button('Ativar licença', 'primary', 'submit', false); ?>
                </form>

                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <?php wp_nonce_field('seven_academy_deactivate_license'); ?>
                    <input type="hidden" name="action" value="seven_academy_deactivate_license" />
                    <?php submit_button('Remover licença do site', 'secondary', 'submit', false); ?>
                </form>
            </div>

            <hr style="max-width: 960px; margin: 40px 0;">

            <div style="max-width: 960px;">
                <h3>Shortcodes de Integração</h3>
                <p>Use os shortcodes abaixo para incluir as funcionalidades da Academy em suas páginas:</p>
                <table class="widefat striped">
                    <thead>
                        <tr>
                            <th>Shortcode</th>
                            <th>Uso Recomendado</th>
                            <th>O que faz</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>[area-do-aluno]</code></td>
                            <td>Portal do Aluno (MIS).</td>
                            <td>Incorpora o Portal do Aluno completo via iframe seguro.</td>
                        </tr>
                        <tr>
                            <td><code>[formulario-cadastro-aluno]</code></td>
                            <td>Páginas de Captura / Inscrição.</td>
                            <td>Incorpora o formulário de pré-matrícula para novos alunos.</td>
                        </tr>
                    </tbody>
                </table>
                <p class="description" style="margin-top: 10px;">
                    <strong>Dica:</strong> Você pode ajustar a altura do iframe adicionando o atributo <code>height</code>, ex: <code>[area-do-aluno height="850px"]</code>.
                </p>
            </div>
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

    public static function render_license_key_field(): void
    {
        $settings = self::get_settings();
        ?>
        <input
            type="password"
            class="regular-text"
            name="<?php echo esc_attr(self::OPTION_KEY); ?>[license_key]"
            value="<?php echo esc_attr($settings['license_key']); ?>"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autocomplete="off"
        />
        <p class="description">Chave de licença fornecida para autorizar este domínio.</p>
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

    public static function save_settings(array $settings): void
    {
        $merged = wp_parse_args($settings, self::default_settings());
        update_option(self::OPTION_KEY, $merged);
    }

    public static function default_settings(): array
    {
        return [
            'base_url' => 'https://academy.7eventos.com',
            'health_path' => '/api/health',
            'tenant_slug' => '',
            'license_key' => '',
            'activation_token' => '',
            'license_activated_at' => '',
        ];
    }

    private static function check_connection(string $baseUrl, string $healthPath): array
    {
        if ($baseUrl === '') {
            return [
                'ok' => false,
                'message' => 'URL base não configurada.',
            ];
        }

        $cacheKey = 'seven_academy_connection_cache';
        $cached = get_transient($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        $result = Seven_Academy_Api_Client::get_json($baseUrl, $healthPath);
        if ($result['ok']) {
            $outcome = [
                'ok' => true,
                'message' => 'Conexão validada com sucesso.',
            ];
            set_transient($cacheKey, $outcome, MINUTE_IN_SECONDS * 5);
            return $outcome;
        }

        $status = (int) ($result['status'] ?? 0);
        $message = (string) ($result['message'] ?? 'Falha ao conectar na API.');

        $outcome = [
            'ok' => false,
            'message' => $status > 0 ? 'HTTP ' . $status . ': ' . $message : $message,
        ];
        set_transient($cacheKey, $outcome, MINUTE_IN_SECONDS * 2);
        return $outcome;
    }

    private static function read_notice(): ?array
    {
        $type = isset($_GET['seven_academy_notice_type']) ? sanitize_text_field((string) $_GET['seven_academy_notice_type']) : '';
        $message = isset($_GET['seven_academy_notice_message']) ? rawurldecode((string) $_GET['seven_academy_notice_message']) : '';

        if ($type === '' || $message === '') {
            return null;
        }

        $allowed = ['success', 'error', 'warning', 'info'];
        if (!in_array($type, $allowed, true)) {
            $type = 'info';
        }

        return [
            'type' => $type,
            'message' => $message,
        ];
    }
}
