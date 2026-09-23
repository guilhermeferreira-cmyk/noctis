import { useEffect, useState } from 'react'
import { api } from '../api'
import { LOGO, doSistema, classePainel } from '../lib/kinds'
import { LogoNoctis } from '../components/LogoNoctis'
import { getIcon } from '../memoryIcons'

/**
 * Modo zen — o Noctis parado.
 *
 * Tudo que existe aqui teve de justificar a própria presença, e quase nada
 * justificou: um relógio, três números e a saída. Nenhuma lista, nenhuma
 * pendência, nenhum aviso. A tela responde "que horas são e o parque está de
 * pé?" — e para. É o oposto do resto do app, que existe para cobrar decisão.
 *
 * O gradiente do fundo é o MESMO do logo (Aparência › Logo), não um segundo
 * degradê inventado aqui: trocar a cor da marca tem de repintar isto junto,
 * senão a tela mais identitária do sistema seria a única a não obedecer.
 */

function Relogio() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    // Acerta no segundo cheio antes de cair no intervalo de 1s; senão o relógio
    // pula de minuto com até um segundo de atraso, que numa fonte grande se vê.
    let id: number
    const tique = () => setAgora(new Date())
    const t = window.setTimeout(() => {
      tique()
      id = window.setInterval(tique, 1000)
    }, 1000 - (Date.now() % 1000))
    return () => { clearTimeout(t); if (id) clearInterval(id) }
  }, [])

  const hh = String(agora.getHours()).padStart(2, '0')
  const mm = String(agora.getMinutes()).padStart(2, '0')
  const data = agora.toLocaleDateString('pt-BR',
    { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="text-center select-none">
      <div className="text-gray-50 leading-none tabular-nums font-extralight
                      text-[clamp(4rem,14vw,11rem)]">
        {hh}<span className="opacity-40 mx-1">:</span>{mm}
      </div>
      {/* `capitalize` do Tailwind sobe TODA palavra, e em português isso vira
          "Quarta-Feira, 23 De Setembro". Só a primeira letra é maiúscula. */}
      <div className="text-gray-400 text-[13px] mt-3 tracking-wide first-letter:uppercase">{data}</div>
    </div>
  )
}

function Numero({ icone, valor, rotulo, cor }: {
  icone: string; valor: number | null; rotulo: string; cor: string
}) {
  const I = getIcon(icone)
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[5.5rem]">
      <span style={{ color: cor }}><I size={22} /></span>
      <span className="text-[26px] text-gray-100 leading-none tabular-nums font-light">
        {valor === null ? '—' : valor}
      </span>
      <span className="text-[11px] text-gray-500">{rotulo}</span>
    </div>
  )
}

export default function ZenPage({ onSair }: { onSair: () => void }) {
  const [n, setN] = useState<{ agentes: number; projetos: number; runtime: number } | null>(null)

  useEffect(() => {
    const ler = () => {
      Promise.all([api.controle(), api.runtime(15, [], '', 1)])
        .then(([c, r]) => setN({
          agentes: c.projetos.reduce((t, p) => t + p.agentes, 0),
          // Repositório de código dentro de projects/ não é projeto de trabalho,
          // e contá-lo aqui inflaria o único número que a tela promete ser exato.
          projetos: c.projetos.filter(p => !p.repositorio).length,
          runtime: r.trabalhando.length,
        }))
        .catch(() => { /* zen não mostra erro: o traço já diz que não sabe */ })
    }
    ler()
    // Relê devagar. Aqui ninguém está esperando resposta — atualizar de minuto
    // em minuto basta, e não vale acordar o servidor a cada 20 segundos.
    const t = setInterval(ler, 60000)
    return () => clearInterval(t)
  }, [])

  // Sair pelo Esc: quem entra em modo zen não quer caçar botão para voltar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSair() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSair])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{ background: '#07070a' }}>
      {/* O gradiente da marca, bem aberto e girando devagar. Fica ATRÁS do
          card para o vidro ter o que filtrar — sem isto o container seria um
          retângulo translúcido sobre nada. */}
      <div aria-hidden="true" className="zen-fundo absolute inset-0"
        style={{
          background: `radial-gradient(60% 60% at 30% 30%, ${LOGO.corA}66, transparent 70%),
                       radial-gradient(55% 55% at 72% 68%, ${LOGO.corB}59, transparent 70%)`,
          animationDuration: `${Math.max(12, LOGO.velocidade * 5)}s`,
        }} />

      <button onClick={onSair} title="Sair do modo zen (Esc)"
        className="absolute top-5 right-6 z-10 text-[12px] text-gray-500 hover:text-gray-100
                   px-3 py-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.06]
                   transition-colors">
        sair
      </button>

      {/* O card: 70% da tela, com borda de sobra de propósito. O vazio em volta
          é parte do que faz a tela ser zen — preencher a borda seria devolver a
          sensação de painel cheio que ela existe para tirar. */}
      <div className={`relative flex flex-col items-center justify-center gap-10
                       ${classePainel()}`}
        style={{ width: '70vw', height: '70vh' }}>
        {/* O sol OPACO sobre o card. Não é marca-d'água: é a coisa mais sólida
            da tela, e o resto flutua em volta dele. */}
        <LogoNoctis size={150} gradiente className="shrink-0" />

        <Relogio />

        {/* Os três números usam o ícone e a cor que VOCÊ escolheu para cada
            seção — trocar a cor de Agentes repinta aqui junto. Cravar valores
            faria da tela mais identitária a única a não obedecer. */}
        <div className="flex items-start gap-10">
          {[{ chave: 'secao.agents', padrao: 'GiRobotGolem', cor: '#10b981', v: n?.agentes, rot: 'agentes' },
            { chave: 'secao.runtime', padrao: 'GiPulse', cor: '#f472b6', v: n?.runtime, rot: 'em trabalho' },
            { chave: 'warden.projetos', padrao: 'GiEmptyChessboard', cor: '#38bdf8', v: n?.projetos, rot: 'projetos' },
          ].map(x => {
            const d = doSistema(x.chave, x.padrao, x.cor)
            return <Numero key={x.chave} icone={d.icon} valor={x.v ?? null} rotulo={x.rot} cor={d.color} />
          })}
        </div>
      </div>
    </div>
  )
}
