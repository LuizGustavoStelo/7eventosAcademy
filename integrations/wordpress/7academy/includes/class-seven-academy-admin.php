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
        add_action('admin_post_seven_academy_force_update', [self::class, 'handle_force_update']);
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

    public static function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        $settings      = self::get_settings();
        $licenseStatus = Seven_Academy_License::get_license_status($settings);
        $notice        = self::read_notice();
        $updateInfo    = Seven_Academy_Updater::fetch_update_data();
        $hasUpdate     = $updateInfo['ok'] && !empty($updateInfo['data']['updateAvailable']);
        $hasLicense    = !empty($settings['license_key']);
        ?>
        <div class="wrap">
            <h1>7academy</h1>
            <p>Painel administrativo do plugin de integracao com a Academy.</p>

            <?php if ($notice) : ?>
                <div class="notice notice-<?php echo esc_attr($notice['type']); ?> is-dismissible">
                    <p><?php echo esc_html($notice['message']); ?></p>
                </div>
            <?php endif; ?>

            <table class="widefat striped" style="max-width: 960px; margin: 16px 0;">
                <tbody>
                    <tr>
                        <td style="width: 260px;"><strong>Status da licenca</strong></td>
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
                        <td><strong>Versao do plugin</strong></td>
                        <td>
                            <?php echo esc_html(SEVEN_ACADEMY_VERSION); ?>
                            <?php if ($hasUpdate) : ?>
                                <span style="margin-left: 10px; color: #b42318; font-weight: bold;">Nova v<?php echo esc_html((string) $updateInfo['data']['latestVersion']); ?> disponivel.</span>
                                <?php
                                $upgradeUrl = wp_nonce_url(
                                    admin_url('update.php?action=upgrade-plugin&plugin=' . urlencode(plugin_basename(SEVEN_ACADEMY_PLUGIN_FILE))),
                                    'upgrade-plugin_' . plugin_basename(SEVEN_ACADEMY_PLUGIN_FILE)
                                );
                                ?>
                                <a href="<?php echo esc_url($upgradeUrl); ?>" class="button button-link" style="color: #b42318; text-decoration: none;">Instalar agora</a>
                            <?php endif; ?>

                            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display: inline-block; margin-left: 10px;">
                                <?php wp_nonce_field('seven_academy_force_update'); ?>
                                <input type="hidden" name="action" value="seven_academy_force_update" />
                                <button type="submit" class="button button-small" title="Limpa o cache e verifica atualizacoes agora">Verificar</button>
                            </form>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div style="max-width: 960px; margin-top: 20px;">
                <h2 style="margin: 0 0 12px;">Ativar licenca</h2>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="max-width: 520px;">
                    <?php wp_nonce_field('seven_academy_activate_license'); ?>
                    <input type="hidden" name="action" value="seven_academy_activate_license" />

                    <div id="seven-academy-license-wrapper">
                        <?php if ($hasLicense) : ?>
                            <div class="seven-academy-key-status" style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px;">
                                <span class="dashicons dashicons-lock" style="color: #146c2e;"></span>
                                <span style="font-weight: 500; color: #146c2e;">Chave de licenca configurada e protegida</span>
                                <button
                                    type="button"
                                    class="button button-secondary button-small"
                                    onclick="document.getElementById('seven-academy-license-input-wrap').style.display='block'; this.parentElement.style.display='none';"
                                >
                                    Trocar Chave
                                </button>
                            </div>
                        <?php endif; ?>

                        <div id="seven-academy-license-input-wrap" style="<?php echo $hasLicense ? 'display: none;' : ''; ?>">
                            <input
                                type="password"
                                class="regular-text"
                                name="license_key"
                                value=""
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                                autocomplete="off"
                            />
                            <p class="description">Insira a chave de licenca fornecida pela Academy.</p>
                        </div>
                    </div>

                    <?php submit_button($hasLicense ? 'Reativar licenca' : 'Ativar licenca', 'primary', 'submit', false); ?>
                </form>
            </div>

            <hr style="max-width: 960px; margin: 40px 0;">

            <div style="max-width: 960px;">
                <h3>Shortcodes de Integracao</h3>
                <p>Use os shortcodes abaixo para incluir as funcionalidades da Academy em suas paginas:</p>
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
                            <td>Paginas de Captura / Inscricao.</td>
                            <td>Incorpora o formulario de pre-matricula para novos alunos.</td>
                        </tr>
                    </tbody>
                </table>
                <p class="description" style="margin-top: 10px;">
                    <strong>Dica:</strong> Voce pode ajustar a altura do iframe adicionando o atributo <code>height</code>, ex: <code>[area-do-aluno height="850px"]</code>.
                </p>
            </div>
        </div>
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
            'license_key'         => '',
            'activation_token'    => '',
            'license_activated_at' => '',
        ];
    }

    public static function handle_force_update(): void
    {
        check_admin_referer('seven_academy_force_update');

        if (!current_user_can('manage_options')) {
            wp_die('Permissao insuficiente.');
        }

        Seven_Academy_Updater::clear_update_cache();

        $query = [
            'page'                         => 'seven-academy',
            'seven_academy_notice_type'    => 'success',
            'seven_academy_notice_message' => rawurlencode('Notificacoes de atualizacao verificadas com sucesso. Se uma nova versao for encontrada, ela aparecera abaixo.'),
        ];

        wp_safe_redirect(add_query_arg($query, admin_url('admin.php')));
        exit;
    }

    private static function read_notice(): ?array
    {
        $type    = isset($_GET['seven_academy_notice_type']) ? sanitize_text_field((string) $_GET['seven_academy_notice_type']) : '';
        $message = isset($_GET['seven_academy_notice_message']) ? rawurldecode((string) $_GET['seven_academy_notice_message']) : '';

        if ($type === '' || $message === '') {
            return null;
        }

        $allowed = ['success', 'error', 'warning', 'info'];
        if (!in_array($type, $allowed, true)) {
            $type = 'info';
        }

        return [
            'type'    => $type,
            'message' => $message,
        ];
    }
}
