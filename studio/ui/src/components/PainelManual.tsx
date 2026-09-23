/**
 * O manual, dentro do produto.
 *
 * Documentação que mora fora do sistema envelhece e ninguém abre. Esta é a
 * mesma verdade do `docs/NOCTIS.md`, resumida ao que se precisa saber na hora
 * da dúvida — o ciclo, quem pode o quê, e onde cada coisa é gravada.
 */

function Passo({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full grid place-items-center text-[11px] tabular-nums
                       text-violet-200 bg-violet-500/20">{n}</span>
      <div className="min-w-0">
        <div className="text-[12.5px] text-gray-100">{titulo}</div>
        <p className="text-[11.5px] text-gray-500 leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  )
}

export function PainelManual() {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[13px] font-semibold text-gray-200 mb-1">O que o Noctis é</h3>
        <p className="text-[11.5px] text-gray-500 leading-relaxed">
          Uma base de conhecimento para os seus agentes. Ele não guarda conversa: guarda o que o
          trabalho deixou — memórias, Learnings, aprendizados validados por você, e quem
          aprendeu o quê. Quatro frases explicam quase todo o desenho:
        </p>
        <ul className="mt-2 space-y-1 text-[11.5px] text-gray-400">
          <li>· Objetivos descem, conhecimento sobe.</li>
          <li>· Memória registra o que aconteceu; aprendizado generaliza o que volta a servir.</li>
          <li>· Você define significado; o agente descobre padrões — ele propõe, nunca conclui.</li>
          <li>· Contexto viaja por referência: id e uma linha, corpo sob demanda.</li>
        </ul>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-gray-200 mb-2">O ciclo do aprendizado</h3>
        <div className="space-y-3">
          <Passo n="1" titulo="O agente consulta antes de começar">
            <code className="text-gray-400">--consultar "assunto"</code> traz os Learnings do
            projeto e os aprendizados que você já validou, cada um com um id.
          </Passo>
          <Passo n="2" titulo="Trabalha, e registra">
            O evento entra no histórico com o que ele exercitou. Se aplicou um aprendizado, cita
            o id — é assim que o reuso é medido.
          </Passo>
          <Passo n="3" titulo="Observa, sem concluir">
            O que ele viu entra como observação. Observação isolada não é padrão.
          </Passo>
          <Passo n="4" titulo="Com duas ou mais, propõe uma hipótese">
            E ela vem obrigatoriamente com a pergunta que a resolveria. Hipótese sem pergunta é
            opinião.
          </Passo>
          <Passo n="5" titulo="Você responde, na aba Aprender">
            Confirmar, refutar, corrigir — escolhendo a causa certa — ou dizer que a pergunta
            está errada. A fila vem ordenada por incerteza: a hipótese perto de 50% é a que mais
            ensina.
          </Passo>
          <Passo n="6" titulo="O que você validou volta no próximo despacho">
            Por referência, na consulta. Aprendizado que ninguém reusa aparece no Diagnóstico —
            conhecimento sem uso é enfeite.
          </Passo>
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-gray-200 mb-2">Quem pode o quê</h3>
        <div className="rounded-lg border border-white/[0.08] divide-y divide-white/[0.06]">
          {[
            ['Criar e nomear Learning', 'só você', 'Agente que nomeio Learning cria nome de arquivo do projeto, não procedimento reusável.'],
            ['Responder as teses de um Learning', 'só você', 'É isso que define o que ela é.'],
            ['Validar hipótese', 'só você', 'O aprendizado nasce da sua resposta — e em "corrigir" vale a causa que você escolheu.'],
            ['Confirmar entrega', 'só você', 'Autoconfirmação é recusada sempre. O resto é regra, em XP e níveis.'],
            ['Observar e propor hipótese', 'agentes', 'É o trabalho deles no loop.'],
            ['Escrever no documento do Learning', 'os dois', 'O agente acrescenta trecho assinado; o que você edita fica curado e ele não sobrescreve.'],
            ['Criar e editar squad', 'os dois', 'Desenhar a organização é parte do trabalho deles, e o desenho errado aparece na vista.'],
            ['Criar tag', 'só você', 'O agente usa as que existem — senão o vocabulário vira sinônimo de si mesmo.'],
          ].map(([o, quem, porque]) => (
            <div key={o} className="px-3 py-2 flex gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-gray-200">{o}</div>
                <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{porque}</p>
              </div>
              <span className={`text-[10px] shrink-0 h-fit px-1.5 py-0.5 rounded ${
                quem === 'só você' ? 'text-violet-200 bg-violet-500/15'
                  : quem === 'agentes' ? 'text-emerald-200 bg-emerald-500/15'
                  : 'text-sky-200 bg-sky-500/15'}`}>{quem}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-gray-200 mb-2">A organização</h3>
        <p className="text-[11.5px] text-gray-500 leading-relaxed">
          Você → Maestro → Líder de squad → Agente. Papel e squad são dado no yaml do agente, e
          não frase no prompt. Papel não é capacidade: o Maestro não precisa ser o modelo mais
          forte, ele é quem tem a visão do todo. Projeto sem squad nenhuma é organização rasa, e
          isso é legítimo — todos falam direto com o Maestro.
        </p>
        <p className="text-[11.5px] text-gray-500 leading-relaxed mt-1.5">
          Quem coordena também ganha XP: despachar, responder a você e consolidar o que a squad
          produziu. A base é baixa, e o ganho vem do despacho virar entrega confirmada — os dois
          lados se encontram pelo nome do despacho.
        </p>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-gray-200 mb-2">Atalhos</h3>
        <div className="space-y-1">
          {[
            ['Ctrl + ,', 'abrir estas configurações'],
            ['Botão do meio na aba', 'fechar a aba'],
            ['Clique direito na árvore', 'menu do item'],
            ['V / H', 'no mapa: seleção e mão'],
            ['Espaço + arrastar', 'no mapa: mover sem trocar de ferramenta'],
          ].map(([k, d]) => (
            <div key={k} className="flex items-center gap-3">
              <kbd className="text-[10.5px] text-gray-300 bg-white/[0.06] border border-white/[0.1] rounded px-2 py-0.5 shrink-0">
                {k}
              </kbd>
              <span className="text-[11.5px] text-gray-500">{d}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-gray-600 leading-relaxed">
        A referência completa — cada registro do histórico, cada regra, cada endpoint — está em
        <code className="text-gray-500"> docs/NOCTIS.md</code>, no repositório.
      </p>
    </div>
  )
}
