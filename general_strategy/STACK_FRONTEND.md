# Stack do frontend — Earth System Detective

## Decisão

**React + TypeScript + Vite**, com deploy estático na **Vercel**. O mapa, os filtros, os gráficos e a comparação A/B rodam no navegador. Vite simplifica o build estático e a distribuição da demo local. Next.js fica como opção se páginas públicas com HTML renderizado ou uma camada de servidor mantida pelo front se tornarem requisitos concretos.

A decisão assume que a equipe de dados disponibilizará uma API científica independente. A documentação de dados prevê um motor estatístico em Python e um contrato JSON com o frontend. O endpoint e o ambiente de integração ainda precisam ser confirmados.

## Tecnologias e responsabilidades

| Parte | Escolha |
| --- | --- |
| Interface e estado | React e TypeScript em modo estrito. Estado da análise na tela, com hooks e parâmetros na URL quando úteis para compartilhar uma consulta. |
| Build e deploy | Vite. Previews na Vercel via Git e produção pela branch main, com integração em develop. |
| Mapa | Leaflet 2D, com Canvas se o volume de pontos exigir. Legenda distingue direção, magnitude e significância. |
| Gráficos | Biblioteca a definir após validar séries temporais, sobreposição, eixos duplos, escala symlog e exportação PNG. |
| Integração | fetch por meio de um cliente tipado, com validação do JSON recebido, cancelamento de consultas obsoletas e estados de carregamento, erro e ausência de dados. |
| Cache e offline | IndexedDB para dados consultados, além de grades globais e recursos cartográficos locais para resiliência sem rede. |

## Fluxo do produto

- O usuário escolhe a variável, seleciona locais A/B com composições de até nove células adjacentes, incluindo formatos como 1×3 e 2×1 e define um período válido para as duas séries. A bancada aceita comparações entre variáveis iguais ou diferentes.
- O mapa carrega a grade global pré-processada e emite a seleção. Um adaptador consulta as séries e métricas regionais sob demanda. Mocks usam o mesmo contrato JSON para que mapa, gráficos e dados avancem em paralelo.
- A API científica concentra a aquisição de dados da NASA, a agregação espacial, os cálculos e a integração com o copiloto. O front exibe séries brutas e anomalias, unidades por década, ajustes OLS, Theil–Sen e GAM, correlações em escalas distintas, outliers e significância conforme o contrato. O copiloto recebe as métricas da análise corrente. Credenciais ficam no servidor.
- O primeiro marco é publicar uma variável real e comparar duas regiões de ponta a ponta. Validar em celular e 4G, com API lenta ou indisponível e com a demo desconectada. O modo offline cobre os pacotes de dados locais e as consultas já armazenadas em cache, conforme os recursos locais disponíveis.

## Pontos a fechar com Dados

- Confirmar se a entrega ao front será uma API, arquivos pré-processados ou ambos, além de responsável, ambiente e formato do contrato.
- Conciliar o catálogo de 4–6 variáveis no contexto mestre com as 12 variáveis e consultas dinâmicas da estratégia. O desenho admite catálogo incremental, grade global pré-processada e consultas regionais dinâmicas.
- Se a integração da NASA ou do copiloto ficar sob responsabilidade do front, reavaliar se endpoints coimplantados com Next.js simplificam a operação. Mais variáveis, gráficos ou processamento científico podem evoluir mantendo o front em Vite e ampliando a API.

## Referências internas

- [Estratégia do projeto](../context/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md)
- [Recursos de dados NASA](../context/knowledge_data/nasa_final_resources.md)
- [Especificação da NASA POWER API](../context/knowledge_data/NASA_POWER_API_SPECS.md)
- [Contexto de mapas](../context/knowledge_maps/prod1_context.md)
- [Contrato estatístico](../context/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md)
