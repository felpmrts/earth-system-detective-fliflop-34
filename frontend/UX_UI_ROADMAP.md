# Roadmap de UX/UI — Project Flipflop 34

Este documento reúne as melhorias propostas para transformar a aplicação em uma experiência científica guiada, legível e acessível. A ordem reflete impacto para o usuário, não dependência técnica absoluta.

## Fase 1 — Fluxo principal

1. **Fluxo em quatro etapas** — Exibir `Variáveis → Período → Regiões → Análise`, com estados pendente, atual e concluído. **Implementado.**
2. **Identidade persistente de A/B** — Ciano para A e laranja para B nos seletores, mapa, resumo, curvas e legendas. **Implementado.**
3. **Resumo antes da consulta** — Mostrar variáveis, quantidade de células, modelo e período antes de analisar. **Implementado.**
4. **Carregamento informativo e cancelável** — Indicar consulta à NASA POWER, tempo decorrido, progresso indeterminado e permitir cancelamento. **Implementado.**
5. **Empty state da Bancada** — Não mostrar controles científicos sem resultado; orientar o usuário de volta ao mapa. **Implementado.**

## Fase 2 — Experiência do mapa

6. **Legenda fixa e compacta** — Explicar cores A/B, contorno, limite de nove células e resolução ativa. **Implementado.**
7. **Pré-visualização da célula** — Destacar a célula sob o cursor antes do clique e mostrar coordenadas/código. **Implementado.**
8. **Navegação espacial assistida** — Ações “Ir para A”, “Ir para B”, “Enquadrar A + B”, “Limpar tudo” e “Desfazer”. **Implementado.**
9. **Nomes de camada orientados ao usuário** — Usar “Satélite NASA”, “Mapa de ruas” e “Relevo”, mantendo detalhes técnicos em tooltip. **Implementado.**

## Fase 3 — Bancada científica

10. **Cabeçalho da descoberta** — Resumir comparação, local e período antes do gráfico. **Implementado.**
11. **Controles segmentados** — Trocar checkboxes por grupos como `Bruto | Anomalia`, `Juntas | Separadas` e opções de tendência. **Implementado.**
12. **Tooltips científicos** — Exibir mês, valor bruto, anomalia, unidade, variável, região e tendência estimada. **Implementado.**
13. **Ajuda contextual** — Explicar OLS, Theil–Sen, FDR, AR(1), anomalia e Mahalanobis em linguagem direta. **Implementado.**
14. **Origem e qualidade dos dados** — Mostrar fonte, cache/API, resolução, cobertura, células, valores ausentes e horário da consulta. **Implementado.**

## Fase 4 — Layout e continuidade

15. **Barra lateral recolhível** — Ganhar área de mapa no desktop e usar drawer no mobile. **Implementado.**
16. **Ações importantes fixas** — Manter “Analisar seleção” visível; no mobile, usar barra inferior fixa. **Implementado.**
17. **Persistência da sessão** — Restaurar variáveis, período, regiões, aba e preferências do gráfico após recarregar. **Implementado.**

## Fase 5 — Acessibilidade

18. **Não depender apenas de cor** — Diferenciar A/B também por rótulo, forma e padrão de linha. **Implementado.**
19. **Navegação completa por teclado** — Foco visível, ordem lógica, calendários acessíveis e mensagens anunciadas. **Implementado.**
20. **Preferências do sistema** — Suportar `prefers-reduced-motion` e `prefers-contrast`. **Implementado.**

## Próxima sequência recomendada

1. Legenda e pré-visualização das células.
2. Cabeçalho e indicadores da descoberta.
3. Controles segmentados da Bancada.
4. Painel de origem e qualidade dos dados.
5. Sidebar recolhível e experiência mobile.
6. Persistência da sessão e auditoria completa de acessibilidade.
