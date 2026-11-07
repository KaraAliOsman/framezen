import type { Translation } from '@dekopen/shared'
import type es from './es'

const pt: Translation<typeof es> = {
  api: {
    network: 'Não conseguimos conectar. Suas alterações estão salvas; tentaremos de novo automaticamente.',
    server: 'Tivemos um problema do nosso lado. Tente de novo em instantes.',
    status: {
      badRequest: 'Revise os dados e tente de novo.',
      unauthorized: 'Sua sessão terminou. Entre de novo para continuar.',
      forbidden: 'Você não tem acesso a isto. Peça ao proprietário da conta para liberar.',
      notFound: 'Não encontramos o que você procura. Pode ter sido excluído ou o link está incompleto.',
      conflict: 'Isto foi alterado em outra aba ou por outra pessoa. Carregamos a versão mais recente.',
      tooLarge: 'O arquivo é grande demais. Tente um com menos de 1 MB.',
      tooMany: 'Muitas solicitações seguidas. Espere alguns segundos e tente de novo.',
    },
    code: {
      invalid_credentials: 'O e-mail ou a senha não conferem. Revise-os ou recupere sua senha.',
      email_taken: 'Esse e-mail já tem uma conta. Entre ou recupere sua senha.',
      too_many_attempts: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
      read_only: 'Sua conta está em modo somente leitura. Revise seu plano para continuar editando.',
      plan_required: 'Isto não está incluído no seu plano. Você pode fazer upgrade em Configurações › Plano.',
      seat_limit: 'Você chegou ao limite de pessoas do seu plano. Faça upgrade para adicionar mais alguém.',
      revision_changed: 'O orçamento mudou enquanto você o revisava. Carregue a versão mais recente.',
      invitation_expired: 'O convite expirou. Peça um novo a quem convidou você.',
      invitation_used: 'Este convite já foi usado. Entre com sua conta.',
      invitation_revoked: 'Este convite foi cancelado. Peça um novo a quem convidou você.',
      payment_provider: 'O meio de pagamento não respondeu. Tente de novo em alguns minutos.',
    },
  },
}

export default pt
