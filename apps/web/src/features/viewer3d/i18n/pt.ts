import type { Translation } from '@dekopen/shared'
import type es from './es'

const pt: Translation<typeof es> = {
  unavailable: {
    title: 'Não foi possível mostrar a vista 3D',
    body: 'Este navegador não consegue desenhar em 3D. O desenho e o orçamento aparecem igual; para girar a janela, use um Chrome, Edge ou Safari atualizado.',
  },
  loading: 'Preparando a vista 3D…',
  hint: 'Arraste para girar',
  open: 'Abrir',
  close: 'Fechar',
  label: 'Janela em 3D de {size}, vista {view}. Arraste para girá-la.',
  view: {
    interior: 'interna',
    exterior: 'externa',
  },
  lost: {
    title: 'A vista 3D foi pausada',
    body: 'O navegador liberou memória gráfica. Sua janela está intacta.',
    retry: 'Mostrar novamente',
  },
  ar: {
    button: 'Ver no seu espaço',
    preparing: 'Preparando…',
    qrTitle: 'Abra no seu celular',
    qrBody: 'Escaneie o código com a câmera e veja a janela em tamanho real na sua casa, sem instalar nada.',
    copy: 'Copiar link',
    copied: 'Link copiado',
    browserTitle: 'Abra no navegador',
    browserBody: 'Este app não mostra realidade aumentada. Copie o link e abra no Safari ou no Chrome.',
    failedTitle: 'Não foi possível abrir',
    failedBody: 'Este celular não conseguiu mostrar a janela no seu espaço. A vista 3D continua disponível aqui.',
    xrLoading: 'Preparando a janela…',
    xrScan: 'Mova o celular devagar e toque no piso ou na parede.',
    xrPlaced: 'Toque em outro ponto para movê-la.',
    xrClose: 'Sair',
    xrRotateLeft: 'Girar para a esquerda',
    xrRotateRight: 'Girar para a direita',
  },
}

export default pt
