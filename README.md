# Meu Sistema de Agentes

Sistema pessoal de agentes de IA para automatizar tarefas de produto e conteúdo.

## Estrutura

```
meu_sistema/
├── agents/              # Configuração de cada agente (.yaml)
│   ├── desenvolvedor.yaml
│   ├── frontend.yaml
│   ├── redator.yaml
│   └── designer.yaml
├── flows/               # Fluxos que encadeiam agentes (.yaml)
│   ├── feature_completa.yaml
│   └── artigo_blog.yaml
├── memory/              # Contexto permanente injetado nos agentes (.md)
│   ├── sobre_mim.md      ← PREENCHA ESTE PRIMEIRO
│   ├── projetos.md       ← E ESTE
│   ├── stack_tecnica.md
│   ├── voz_marca.md
│   └── design_system.md
├── outputs/             # Resultados salvos automaticamente
├── orchestrator.py      # Motor principal
└── README.md
```

## Instalação

```bash
pip install anthropic pyyaml

export ANTHROPIC_API_KEY="sua-chave-aqui"
```

## Como usar

### Agente único
```bash
python orchestrator.py --agent desenvolvedor --input "crie um endpoint de login com JWT"
python orchestrator.py --agent redator --input "escreva um post sobre IA no agronegócio"
python orchestrator.py --agent designer --input "crie prompts para imagem de hero da landing page"
python orchestrator.py --agent frontend --input "crie um componente de tabela paginada"
```

### Fluxo completo
```bash
python orchestrator.py --flow artigo_blog --input "tema: como usar IA para dobrar produtividade"
python orchestrator.py --flow feature_completa --input "feature de dashboard com métricas de uso"
```

### Listar o que está disponível
```bash
python orchestrator.py --list
```

## Personalizando um agente

Abra o arquivo `.yaml` do agente em `agents/` e edite:
- `system_prompt`: o comportamento do agente
- `memory_files`: quais contextos ele carrega
- `tools`: ferramentas disponíveis (para versão futura)
- `temperature`: 0.2–0.4 para tarefas técnicas, 0.6–0.8 para criativas

## Adicionando um novo agente

Crie `agents/meu_agente.yaml` seguindo a estrutura dos existentes.
Pronto — ele já fica disponível via `--agent meu_agente`.

## Adicionando um novo fluxo

Crie `flows/meu_fluxo.yaml` seguindo a estrutura dos existentes.
Use `{{ output_key }}` para passar dados entre steps.

## Próximos passos sugeridos

- [ ] Preencher os arquivos de memória (`memory/`)
- [ ] Testar cada agente com uma tarefa real
- [ ] Criar interface web (Streamlit ou Flask) para rodar sem terminal
- [ ] Adicionar agente "pesquisador" com web search
- [ ] Conectar ferramentas reais (leitura de arquivos, APIs)
