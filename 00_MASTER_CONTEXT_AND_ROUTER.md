# 00. Master Context & Router de Conhecimento — NASA Space Apps 2026 (*Be An Earth System Trend Detective!*)

> **INSTRUÇÃO DE SISTEMA PARA AGENTES DE IA (PROGRESSIVE DISCLOSURE PROTOCOL):**
> Este arquivo (`00_MASTER_CONTEXT_AND_ROUTER.md`) é o **Ponto de Entrada Único (Single Source of Truth)** de todo o projeto.
> **NÃO leia todos os arquivos do repositório de uma vez.** Para economizar tokens, preservar a janela de atenção e evitar degradação de raciocínio (*context rot*), siga estritamente este protocolo:
> 1. Absorva o **Contexto Ultra-Denso do Projeto** nas Seções 1, 2 e 3 abaixo (isso já contém 80% das decisões globais).
> 2. Consulte a **Árvore de Decisão ("Qual Pergunta Você Precisa Responder?")** na Seção 4 ou o **Catálogo Completo de Documentos Markdown** na Seção 5.
> 3. Abra **apenas** os arquivos (ou intervalos de linhas `#L...`) necessários para a sua subtarefa atual.
> 4. Sempre que criar um novo documento `.md` durante o hackathon, **registre-o imediatamente na Seção 5 e 6 deste arquivo**.

---

## 1. Contexto Ultra-Denso do Desafio e do Produto (O Que Estamos Construindo)

- **Evento & Janela Real:** NASA International Space Apps Challenge 2026 | Sábado 09:00 $\to$ Domingo 24:00 (**39h corridas / ~30h produtivas por pessoa** descontando 6h obrigatórias de sono e pausas).
- **Desafio Selecionado:** **Be An Earth System Trend Detective!** (Listado como Desafio #14 no portal oficial / seção #2 do dossiê preliminar).
- **O Problema Científico Central:** Variáveis ambientais da Terra (atmosfera, terra, oceano, gelo) medidas por satélites e modelos da NASA mudam ao longo das décadas. Contudo, **o mesmo processo físico global pode produzir uma tendência de alta numa região e uma tendência de queda em outra** (divergência espacial), ou **subir no longo prazo enquanto oscila em oposição de fase no curto prazo** (paradoxo multiescala).
- **O Entregável (Definição de Pronto):** Uma aplicação web interativa, rápida, baseada em um **catálogo curado de 4 a 6 variáveis da NASA pré-computadas** (nunca cálculo pesado ao vivo na demo!), onde o usuário escolhe uma variável e clica em qualquer região/ponto (ou compara 2 regiões lado a lado) e recebe imediatamente — sem precisar ler documentação — as **4 Respostas do Detetive**:
  1. **O QUE está mudando?** (*What is changing?* — Variável física, série bruta vs. anomalia climatológica sem sazonalidade, e formato do regime: linear, acelerando ou desacelerando).
  2. **ONDE está mudando?** (*Where is it changing?* — Mapa espacial interativo destacando divergências regionais *"sobe aqui, cai ali"* e comparação lado a lado de duas regiões).
  3. **QUANTO está mudando?** (*How much is it changing?* — Taxa de variação por década extraída sobre **toda a nuvem de pontos**, nunca apenas ponto final menos inicial).
  4. **A mudança é ESTATISTICAMENTE SIGNIFICATIVA?** (*Is it statistically significant?* — Separação rigorosa entre tendência secular real e ruído/ciclos naturais como El Niño, corrigida para memória climática e falsos positivos espaciais).
- **Repositório & Fluxo Git:** `https://github.com/felpmrts/earth-system-detective-fliflop-34` possui duas branches (`main` e `develop`). **Regra para IAs:** todas as alterações devem ser feitas e commitadas em `develop` primeiro (nunca direto na `main`, salvo instrução explícita).

---

## 2. Governança da Equipe de 6 Pessoas, Trilhas Paralelas e Portões (Hard Gates)

A equipe opera em **4 trilhas paralelas desacopladas por um Contrato de Dados JSON** fechado às **10:30 de sábado** (para que o Frontend construa a interface com *mock data* enquanto Dados processa os satélites da NASA):

| Papel | Código | Responsabilidade Primária | Par de Backup (Anti-SPOF) |
| :--- | :---: | :--- | :---: |
| **Coordenação & Deploy** | `COORD` | Integração contínua, controle dos portões, deploy ativo, submissão | `NARR` |
| **Engenharia de Dados** | `DADOS-1` | Ingestão NASA, limpeza, conversão para o Contrato de Dados JSON | `DADOS-2` |
| **Estatística & Ciência** | `DADOS-2` | Anomalias, regressão robusta/GAM, testes de significância, sanidade física | `DADOS-1` |
| **Mapas & Visualização Geo** | `PROD-1` | Mapa interativo de tendências, camada de significância, performance, modo offline | `PROD-2` |
| **Interface & UX** | `PROD-2` | Gráficos de séries temporais, painel das 4 respostas, comparador de 2 regiões | `PROD-1` |
| **Narrativa, Pesquisa & Vídeo** | `NARR` | Contexto científico em linguagem clara, caça de achados reais, roteiro e edição do vídeo | `COORD` |

- **Os 5 Portões Inegociáveis (*Se falhar, corta-se escopo; o prazo nunca se move*):**
  - **Marco 0 (Sáb 10:30):** Contrato de Dados JSON fechado entre `DADOS-1`, `DADOS-2` e `PROD-1`.
  - **Portão 1 (Sáb 12:30):** Ao menos **1 variável real da NASA** tratada em mãos no formato do contrato (senão, ativar Plano B de dados).
  - **Portão 2 (Sáb 16:00):** **Walking Skeleton** (fluxo ponta a ponta com 1 variável real rodando no navegador publicado).
  - **Checkpoint de Descoberta (Sáb 22:30 – 00:30):** Demo interna + investigação com a ferramenta para achar 2–3 histórias climáticas reais validadas. *(Sono obrigatório: 01:00–07:00)*.
  - **Portão 3 (Dom 13:00):** **Feature Freeze** (congelamento de código + pacote 100% offline pronto; a partir daqui, só correção de bug).
  - **Portão 4 (Dom 19:00):** Vídeo de pitch exportado, legendado e revisado a frio.
  - **Portão 5 (Dom 22:30):** Submissão oficial enviada e verificada por testes cegos em 4G/celulares (90 min de margem antes das 24:00).

---

## 3. Os 7 Invariantes Estatísticos de Estado da Arte (Regras Invioláveis para Código e Pitch)

Extraídos da base teórica de Hindemburg Melão Jr. e integrados à climatologia moderna. **Nenhum agente de IA pode violar estas regras:**

1. **PROIBIDO calcular tendência por Ponto Final menos Ponto Inicial ($Y_{\text{fim}} - Y_{\text{início}}$):** Descartar a trajetória intermediária é um erro primário grosseiro que confunde fase de El Niño/La Niña com tendência secular. Toda taxa ("Quanto muda?") **deve** vir da regressão ajustada à íntegra dos $N$ pontos da nuvem: $B_{\text{OLS}}$ e **Declive Mediano Robusto de Theil-Sen ($B_{\text{Sen}}$)** expressos por década ($10 \times B_{\text{ano}}$).
2. **Isolamento de Confundidores antes da Regressão (Princípio Henrietta Leavitt):** Assim como Leavitt isolou a distância estelar observando Cefeidas apenas na Nuvem de Magalhães, é proibido regredir séries mensais brutas contaminadas pelo ciclo verão/inverno. Extraia primeiro a **Anomalia Climatológica Mensal** ($Y'_{a,m} = Y_{a,m} - \bar{Y}_m$), garanta a mesma janela temporal $[t_0, t_f]$ ao comparar regiões e audite trocas de sensores (MODIS/VIIRS, GRACE/GRACE-FO).
3. **Respeito Absoluto à Escala da Variável (Razão vs. Intervalar):** É **proibido** exibir variação percentual ($\%$) para variáveis em **escala intervalar** (sem zero absoluto real, como Temperatura em $^\circ\text{C}$ ou Anomalias de Água do GRACE em $\text{cm}$). Em escalas intervalares, exiba apenas diferenças ($\pm X\,^\circ\text{C/década}$). Porcentagens só são permitidas em escalas de razão puras (ex.: área de gelo em $\text{km}^2$, precipitação absoluta em $\text{mm}$).
4. **Distinção entre Inclinação ($B$) e Acoplamento/Correlação ($r$ / $\tau$):** A regressão ($B$) informa *quanto* $Y$ varia em função de $X$; a correlação ($r$ de Pearson, $\tau$ de Kendall) informa *quão estreita é a elipse de contorno* (quão previsível e sem ruído é a variação). Exiba ambos!
5. **Decomposição de Correlação Multiescala (Global vs. Local):** Ao comparar 2 regiões ou 2 variáveis, meça tanto a **correlação secular de longo prazo ($r_{\text{global}}$)** quanto a **correlação residual de curto prazo sem tendência ($r_{\text{detrended}}$)**. Duas regiões podem subir juntas em 25 anos ($r_{\text{global}} > 0$) e operar em oposição sistemática em janelas de 6–24 meses ($r_{\text{detrended}} < 0$).
6. **Modelagem Não-Linear com GAM/Splines e Diagnóstico de "Corcovas":** Nunca use polinômios livres de grau alto (que criam falsas inversões físicas nas pontas). Combine a reta de tendência com uma curva suave (**GAM / Smoothing Spline**) para revelar aceleração/saturação física e use a geometria da curva para separar artefatos de satélite (*degrau global*), pulsos de El Niño (*corcova reversível*) e mudanças reais de regime (*rampa persistente*).
7. **Outliers via Elipse de Mahalanobis + Significância Espacial ($\text{AR}(1)$ + FDR):** Identifique anos extremos fora da elipse bivariada pela **Distância de Mahalanobis ($D_M > 2{,}5$)** sem apagá-los silenciosamente. Para responder *"É significativo?"*, corrija o $p\text{-valor}$ para **autocorrelação serial $\text{AR}(1)$** ($N_{\text{efetivo}}$ de Santer / Hamed-Rao) e aplique **Benjamini-Hochberg (FDR, $q < 0{,}05$)** na grade do mapa para eliminar falsos positivos em massa.

---

## 4. Roteador Inteligente para IAs: "Qual Pergunta Você Precisa Responder Agora?"

Use a tabela abaixo para saltar diretamente para o documento (e seção) exato sem ler arquivos desnecessários:

| Se a sua tarefa ou dúvida atual é...                                                                                                                         | Leia APENAS este(s) arquivo(s) / linhas                                                                                                                                                                                                                                                                                                                                                                            |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Preciso criar ou validar o esquema JSON do Contrato de Dados (Fase 1) ou implementar o backend/frontend das 4 respostas"**                                | 👉 [`knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md#L1-L115) *(Contém o JSON completo pronto e o mapeamento das 4 perguntas)*                                                                                                        |
| **"Preciso saber o cronograma da equipe, quem faz o quê em cada fase, regras de branch ou como agir se um portão atrasar"**                                  | 👉 [`general_strategy/ESTRATEGIA_TREND_DETECTIVE.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L50-L518) *(Seções 3, 4, 5 e 7)*                                                                                                                                                                                                                       |
| **"Preciso programar o cálculo de tendência linear ($B$), intercepto centralizado ($A_0$) e entender por que não usar inicial-final"**                       | 👉 [`knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md#L25-L128)                                                                                                                                                                                    |
| **"Preciso pré-processar uma variável da NASA, remover sazonalidade (anomalias), tratar escalas ($^\circ\text{C}$ vs $\text{mm}$) ou harmonizar satélites"** | 👉 [`knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md#L33-L125) *(Inclui tabela de decisão por variável na Seção 4)*                                                                                                                                 |
| **"Preciso implementar o Comparador Lado a Lado de 2 Regiões, divergência espacial ou correlação de longo vs. curto prazo"**                                 | 👉 [`knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md#L32-L129)                                                                                                                                                                              |
| **"A série temporal não é linear (está acelerando, saturando ou tem uma 'corcova' estranha): como ajustar GAM/Spline e diagnosticar?"**                      | 👉 [`knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md#L40-L128)                                                                                                                                                                          |
| **"Preciso programar o teste de significância ($p\text{-valor}$ com $\text{AR}(1)$ + FDR no mapa), Theil-Sen ou detectar outliers com Mahalanobis"**         | 👉 [`knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md#L19-L115)                                                                                                                                                                                    |
| **"Preciso estruturar o roteiro do Vídeo de Pitch, auditar se um achado climático é real ou defender nosso rigor para os jurados"**                          | 👉 [`knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md#L102-L130) + [`general_strategy/ESTRATEGIA_TREND_DETECTIVE.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L303-L382) |
| **"Quero ver o panorama geral dos 14 desafios da NASA Space Apps 2026 e os 4 critérios de avaliação de 25%"**                                                | 👉 [`general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md#L39-L110)                                                                                                                                                                                                                          |

---

## 5. Catálogo Completo de Todos os Documentos Markdown (`.md`) do Projeto

Abaixo estão **todos os 9 documentos Markdown existentes atualmente no workspace**, organizados por módulo funcional, com tamanho aproximado e resumo cirúrgico de conteúdo:

### 🏛️ Camada 0: Roteador Central (Raiz)
1. **[`00_MASTER_CONTEXT_AND_ROUTER.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/00_MASTER_CONTEXT_AND_ROUTER.md)** *(Este documento)*
   - **Papel:** Ponto de entrada único para IAs e humanos. Contém o resumo executivo denso do projeto, os 7 invariantes estatísticos, a árvore de decisão de leitura seletiva e o inventário vivo de todos os arquivos `.md`.

### 🧭 Camada 1: Estratégia Geral, Governança e Contexto NASA (`general_strategy/`)
2. **[`general_strategy/ESTRATEGIA_TREND_DETECTIVE.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md)** *(542 linhas | ~41 KB)*
   - **Resumo:** Plano diretor operacional para as 39 horas do desafio *"Be An Earth System Trend Detective!"*. Define o critério de aceitação das 4 perguntas, divisão da equipe de 6 pessoas (`COORD`, `DADOS-1`, `DADOS-2`, `PROD-1`, `PROD-2`, `NARR`), desenvolvimento paralelo via Contrato de Dados, cronograma detalhado das 8 Fases + 5 Portões, escopo MoSCoW, matriz de 15 riscos e checklist de submissão.
3. **[`general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/RELATORIO_ESTRATEGICO_SPACEAPPS_2026.md)** *(299 linhas | ~29 KB)*
   - **Resumo:** Dossiê preliminar dos 14 desafios do NASA Space Apps 2026, metodologia dos jurados (Impacto Galáctico, Uso de Dados NASA, Protótipo MVP, Pitch) e análise preliminar de satélites (MODIS, AIRS, OMI, GRACE/GRACE-FO, Giovanni) e ferramentas (Xarray, NetCDF4, Deck.gl/Leaflet) para o *Trend Detective* (listado na seção #2 do relatório, linhas 97–109).

### 📐 Camada 2: Base de Conhecimento Estatístico de Estado da Arte (`knowledge_base_estatistica/`)
4. **[`knowledge_base_estatistica/00_INDICE_E_ARQUITETURA_ESTATISTICA.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/00_INDICE_E_ARQUITETURA_ESTATISTICA.md)** *(~8 KB)*
   - **Resumo:** Índice específico da pasta estatística e diagrama de transformação ligando os conceitos extraídos de [`transcricao.txt`](file:///home/zrhyan/Principal/Computation/Space%20Apps/transcricao.txt) (Hindemburg Melão Jr.) às 4 perguntas do desafio da NASA.
5. **[`knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/01_FUNDAMENTOS_E_ERROS_CLASSICOS_DE_REGRESSAO.md)** *(~12 KB)*
   - **Resumo:** A regressão como regra de três sobre toda a nuvem de pontos; por que calcular variação por $Y_{\text{final}} - Y_{\text{inicial}}$ é um erro primário catastrófico; anatomia de $\hat{Y} = A + BX$ (tendência decadal, centralização do intercepto $A_0$ para evitar o "falso zero"); comparação entre Mínimos Quadrados (OLS) e ajuste robusto por desvios absolutos/mediana (Theil-Sen); boas práticas visuais para gráficos de dispersão e séries temporais.
6. **[`knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/02_ESCALAS_CONTROLE_DE_VARIAVEIS_E_ANOMALIAS.md)** *(~15 KB)*
   - **Resumo:** O **Princípio de Henrietta Leavitt** (controle da distância nas Cefeidas da Nuvem de Magalhães) traduzido para isolar os 3 confundidores dos dados da NASA: sazonalidade anual (cálculo de anomalias climatológicas e $Z\text{-score}$), descontinuidade de sensores (MODIS/VIIRS, GRACE) e janelas temporais. Diferença entre escalas de razão vs. intervalar (proibição de $\%$ em $^\circ\text{C}$ e anomalias), *offset* basal e escalas logarítmicas/invertidas.
7. **[`knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/03_CORRELACAO_MULTIESCALA_E_DIVERGENCIA_ESPACIAL.md)** *(~14 KB)*
   - **Resumo:** Diferença geométrica e operacional entre Correlação ($r$, largura da elipse e preditividade) e Regressão ($B$, taxa física). O **Paradoxo das Correlações Multiescala** (como duas séries têm correlação positiva em 25 anos e correlação sistematicamente negativa a curto prazo por dipolos como El Niño). Taxonomia de correlações (Pearson, Spearman, $\tau$ de Kendall, Biweight de Tukey), variáveis compostas/*proxies* e prevenção contra correlações contaminadas (circularidade).
8. **[`knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/04_MODELAGEM_NAO_LINEAR_GAMS_E_CONSTRICOES_FISICAS.md)** *(~13 KB)*
   - **Resumo:** Dissipação física e saturação (experimento da xícara no micro-ondas); perigo de polinômios livres; uso de **GAMs (Generalized Additive Models)**, *Splines* penalizadas e regressão com constrição monotônica; distinção entre logística e GAM via derivadas $f'(x), f''(x)$; árvore de decisão forense para diagnosticar "corcovas" (anomalias locais) separando erro de sensor, pulso de El Niño e mudança estrutural de regime.
9. **[`knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/05_OUTLIERS_ROBUSTEZ_E_SIGNIFICANCIA_ESPACIAL.md)** *(~13 KB)*
   - **Resumo:** Detecção bivariada de *outliers* via **Elipse e Distância de Mahalanobis ($D_M$)**; alerta sobre distribuições de caudas pesadas vs. Normal Gaussiana; dupla validação OLS + Theil-Sen; estado da arte em significância estatística com correção para **autocorrelação serial $\text{AR}(1)$** ($N_{\text{efetivo}}$ de Santer / Hamed-Rao) e controle de falsos positivos espaciais em massa no mapa via **FDR de Benjamini-Hochberg ($q < 0{,}05$)**.
10. **[`knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/knowledge_base_estatistica/06_GUIA_OPERACIONAL_PARA_AGENTES_DE_IA_NO_HACKATHON.md)** *(~11 KB)*
    - **Resumo:** Manual executável direto para o hackathon. Contém a matriz matemática das 4 perguntas, o **schema JSON completo do Contrato de Dados** (com suporte a regressão dupla, GAM, Mahalanobis, $\text{AR}(1)$ + FDR e comparador multiescala de 2 regiões), o checklist de 10 pontos para auditoria de achados e o pitch de 20 segundos sobre rigor científico.

---

## 6. Slot para Novos Documentos Markdown (Atualização Contínua antes e durante o Hackathon)

> **Regra de Manutenção para Agentes de IA:** Sempre que um novo documento `.md` for criado (seja hoje na preparação da Tarefa 2 sobre fontes de dados da NASA, seja amanhã durante a execução das Fases 1 a 8), adicione-o imediatamente na tabela abaixo:

| Status | Caminho Planejado / Criado | Papel do Documento | Responsável |
| :---: | :--- | :--- | :---: |
| ⏳ *Planejado* | `DATA_STRATEGY_AND_SOURCES.md` *(Tarefa 2)* | Caminhos práticos para buscar, baixar e processar dados da NASA (APIs, recortes, Plano A e Plano B). | Preparação / `DADOS-1` |
| ⏳ *Fase 1 (Sáb 10:30)* | `CONTRATO_DE_DADOS.md` | Especificação congelada do JSON entre Backend (`DADOS-1/2`) e Frontend (`PROD-1/2`). | `DADOS-1` + `PROD-1` |
| ⏳ *Fase 1 (Sáb 10:30)* | `DECISOES.md` | Log cronológico de decisões de escopo e arquitetura (2 linhas por decisão). | `COORD` |
| ⏳ *Fase 4/6* | `DATA_SOURCES.md` | Citação oficial dos datasets da NASA, DOIs, resolução, período e limitações conhecidas. | `DADOS-1` + `NARR` |
| ⏳ *Fase 6* | `README.md` | Documentação pública do repositório para os jurados da NASA (instruções de uso e reprodução). | `COORD` + `NARR` |
