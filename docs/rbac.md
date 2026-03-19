# RBAC

Perfis obrigatórios:

- `superadmin`: gestão global da plataforma
- `admin`: gestão operacional da conta
- `user`: acesso acadêmico básico

## Regras mínimas

- `superadmin` pode gerenciar contas, admins e impersonar usuários.
- `admin` pode gerenciar cursos, turmas, matrículas, materiais e presença da própria conta.
- `user` só acessa dados próprios e conteúdo permitido.

## Segurança

- Tokens JWT com curta duração + refresh token.
- Impersonação com motivo obrigatório e expiração curta.
- Auditoria imutável para ações de privilégio elevado.
