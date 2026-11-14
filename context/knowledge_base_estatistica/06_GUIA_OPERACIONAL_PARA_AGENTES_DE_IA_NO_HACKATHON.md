# 06. Guia Operacional e Contrato Estatístico para Agentes de IA no Hackathon

> **Referência Base:** Síntese executável dos Documentos `01` a `05` integrada à governança de [`ESTRATEGIA_TREND_DETECTIVE.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md)
> **Objetivo para Agentes de IA:** Este documento é o **manual de bolso e checklist de auditoria** para qualquer agente de IA (seja GPT, Claude, Gemini ou subagentes) acionado durante as 39 horas do hackathon. Ele define **o que deve entrar no Contrato de Dados (Fase 1)**, **como cada pergunta do desafio é respondida matematicamente** e **quais erros jamais podem ser cometidos**.

---

## 1. Mapeamento Matemático Oficial das 4 Perguntas do Desafio (#14)

Conforme definido na seção 1 de [`ESTRATEGIA_TREND_DETECTIVE.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L30), o critério de aceitação ("definição de pronto") exige que, para qualquer variável e região clicada, a ferramenta responda de imediato: **O quê, Onde, Quanto e Significância**.

Abaixo está a especificação de **Estado da Arte** (baseada nos ensinamentos de Hindemburg Melão Jr. em [`transcricao.txt`](file:///home/zrhyan/Principal/Computation/Space%20Apps/transcricao.txt)) para cada uma das 4 respostas:

| Pergunta do Desafio | Métrica Primária (Obrigatória) | Métrica Complementar (Estado da Arte) | Proibição Absoluta (Anti-Erro) |
| :--- | :--- | :--- | :--- |
| **1. O QUE muda?** (*What is changing?*) | Nome físico da variável + **Anomalia Climatológica** ($Y'_{a,m} = Y_{a,m} - \bar{Y}_m$) + Regime da curva (**Linear constante**, **Acelerando** ou **Desacelerando/Saturando** via GAM/derivada). | Identificação de eventos extremos fora da **Elipse de Mahalanobis** ($D_M > 2{,}5$) e diagnóstico de saltos de sensores. | Nunca misturar sensores não-harmonizados nem regredir série mensal bruta dominada por ondas de verão/inverno sem extrair a anomalia (Princípio Henrietta Leavitt). |
| **2. ONDE muda?** (*Where is it changing?*) | Coordenadas/Região + **Mapa de Divergência Espacial** colorido por $B_{\text{década}}$ + comparação direta com região de tendência oposta (*"Sobe aqui, cai ali"*). | **Decomposição de Correlação Multiescala** entre regiões: Correlação Secular de Longo Prazo ($r_{\text{global}}$) vs. Correlação Residual de Curto Prazo ($r_{\text{local}}$). | Nunca comparar duas regiões usando janelas de anos diferentes (ex.: $2000\text{–}2025$ vs. $2012\text{–}2025$). |
| **3. QUANTO muda?** (*How much is it changing?*) | **Inclinação da Regressão sobre toda a nuvem** expressa por década: **Declive Robusto de Sen ($B_{\text{Sen}}$)** e **OLS ($B_{\text{OLS}}$)** + Variação acumulada na reta $\Delta \hat{Y} = B \cdot \Delta t$. | Parâmetro de nível inicial centralizado $A_0 = \hat{Y}(t_{\text{início}})$ + Curva não-linear **GAM / Spline Monotônica** para capturar curvatura física. | **PROIBIDO:** Calcular $Y_{\text{final}} - Y_{\text{inicial}}$ (erro primário do ponto inicial/final) e **PROIBIDO** calcular variação percentual ($\%$) em escalas intervalares como $^\circ\text{C}$ ou anomalias! |
| **4. É SIGNIFICATIVO?** (*Is it statistically significant?*) | **$p\text{-valor}$ corrigido para Autocorrelação $\text{AR}(1)$** ($N_{\text{efetivo}}$ de Santer / Hamed-Rao) + **Controle Espacial de Falsas Descobertas (FDR Benjamini-Hochberg, $q < 0{,}05$)**. | **Coeficiente de Correlação ($r$ de Pearson e $\tau$ de Kendall)** medindo a estreiteza da elipse (quão bem o tempo prediz a variável). | Nunca usar $p < 0{,}05$ ingênuo sem corrigir autocorrelação serial e sem controlar múltiplos testes na grade do mapa. |

---

## 2. Especificação dos Campos Estatísticos para o "Contrato de Dados" (Fase 1 — Sábado 09:45)

Na **Fase 1** de [`ESTRATEGIA_TREND_DETECTIVE.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L228), `DADOS-1`, `DADOS-2` e `PROD-1` fecham o **Contrato de Dados** às 10:30 de sábado para que o Frontend trabalhe em paralelo com *mock data* enquanto o Backend processa os dados reais da NASA.

Para que o Frontend (`PROD-1` e `PROD-2`) já nasça preparado para exibir o estado da arte estatístico sem retrabalho, o JSON de cada região/ponto no Contrato de Dados deve incluir o seguinte bloco `statistics`:

```json
{
  "variable_id": "grace_tws_anomaly",
  "variable_name": "Anomalia de Armazenamento de Água Terrestre (GRACE/GRACE-FO)",
  "scale_type": "interval",
  "unit": "cm EWT",
  "trend_unit": "cm / década",
  "allow_percentage_change": false,
  "period": {
    "start": "2002-04",
    "end": "2025-12",
    "n_observations": 248,
    "n_effective_ar1": 54.2
  },
  "regression": {
    "intercept_at_start_A0": 2.14,
    "slope_per_decade_ols": -14.20,
    "slope_per_decade_sen": -13.85,
    "slope_ci95_low": -16.90,
    "slope_ci95_high": -11.10,
    "cumulative_model_change": -32.89,
    "quadratic_acceleration_B2": -0.042,
    "regime_shape": "accelerating_decline"
  },
  "correlation_and_coupling": {
    "pearson_r": -0.86,
    "kendall_tau": -0.71,
    "r_squared": 0.74,
    "ellipse_aspect_ratio": 0.26
  },
  "significance": {
    "p_value_naive": 1.2e-28,
    "p_value_ar1_corrected": 0.00018,
    "fdr_q_value": 0.00095,
    "is_significant_fdr05": true,
    "confidence_tier": "CONFIRMED_HIGH"
  },
  "outliers_mahalanobis": [
    {
      "date": "2015-11",
      "observed_anomaly": -29.4,
      "expected_regression": -16.2,
      "mahalanobis_d": 3.12,
      "direction": "below_ellipse",
      "diagnostic_hint": "Pico de seca associado ao Super El Niño 2015-2016"
    }
  ],
  "series": {
    "dates": ["2002-04", "2002-05", "..."],
    "raw_values": [4.1, 6.2, "..."],
    "anomaly_values": [1.8, 2.0, "..."],
    "linear_fit": [2.14, 2.02, "..."],
    "gam_smooth_fit": [1.95, 1.90, "..."]
  }
}
```

### E para o Comparador de Divergência entre 2 Regiões (`PROD-2`):

```json
{
  "comparison_pair": {
    "region_a_id": "amazon_south",
    "region_b_id": "sahel_east",
    "spatial_divergence_detected": true,
    "slope_difference_per_decade": -22.4,
    "multiscale_correlation": {
      "long_term_secular_r": -0.78,
      "short_term_detrended_r": -0.64,
      "paradox_type": "OPPOSING_SECULAR_AND_COUPLED_DIPOLE",
      "interpretation": "Enquanto a Região A perde água a longo prazo (-14,2 cm/década), a Região B ganha (+8,2 cm/década), impulsionadas por deslocamento meridional da ZCIT."
    }
  }
}
```

---

## 3. Checklist de Auditoria "Quatro Olhos" para a Fase 5 e Fase 6 (`DADOS-2` + `NARR`)

Antes de gravar o vídeo de pitch no domingo (Fase 7) ou declarar qualquer "achado científico" na Fase 5, o agente de IA e o responsável por `DADOS-2` devem passar cada descoberta pelos **10 Testes de Blindagem Hindemburg**:

- [ ] **1. Zero Erro Inicial/Final:** A taxa de variação citada no texto e no vídeo veio da inclinação $B$ da regressão sobre toda a nuvem de pontos (e **não** da subtração entre o último e o primeiro valor)?
- [ ] **2. Isolamento Sazonal (Leavitt):** A regressão foi calculada sobre **anomalias mensais dessazonalizadas** (ou médias anuais completas), eliminando a contaminação verão/inverno?
- [ ] **3. Respeito à Escala da Variável:** Se a variável está em escala intervalar ($^\circ\text{C}$ ou anomalia com valores positivos e negativos), garantimos que **não existe nenhuma porcentagem ($\%$)** associada a ela na tela ou no roteiro?
- [ ] **4. Concordância OLS vs. Robusto (Theil-Sen):** A inclinação por Mínimos Quadrados ($B_{\text{OLS}}$) e o Declive Mediano de Sen ($B_{\text{Sen}}$) apontam na mesma direção? Se divergirem, inspecionamos quais *outliers* fora da elipse de Mahalanobis causaram a divergência?
- [ ] **5. Distinção entre Inclinação ($B$) e Correlação ($r$):** Explicamos corretamente ao usuário tanto a velocidade da mudança ($B$, da regressão) quanto o grau de estreiteza/previsibilidade da nuvem ($r$, da correlação)?
- [ ] **6. Verificação de Curvatura e Constrição Física (GAM):** A curva suave (GAM/Spline) mostra aceleração recente ou saturação física? Garantimos que nenhum polinômio livre gerou inversão não-física nas pontas da série?
- [ ] **7. Diagnóstico de "Corcovas" e Quebras de Sensor:** Se há um salto ou "corcova" na série, verificamos na ficha de `DADOS-1` se não é uma troca de satélite (ex.: transição MODIS/VIIRS ou hiato GRACE)?
- [ ] **8. Significância Corrigida para Memória Climática ($\text{AR}(1)$):** O $p\text{-valor}$ reportado leva em conta o tamanho efetivo da amostra ($N_{\text{eff}}$)?
- [ ] **9. Controle Espacial de Falsas Descobertas (FDR):** O mapa de significância passou pelo filtro de Benjamini-Hochberg para não pintar $5\%$ do planeta como significativo por puro acaso?
- [ ] **10. Ausência de Correlação Contaminada e Cautela Causal:** Ao cruzar duas variáveis ou regiões, garantimos que elas não são derivadas da mesma fórmula matemática interna e evitamos afirmar "X causou Y" sem respaldo físico documentado?

---

## 4. Como Explicar Nosso Rigor Estatístico em 20 Segundos no Vídeo de Pitch (Fase 7)

No item 5 da estrutura do vídeo de pitch em [`ESTRATEGIA_TREND_DETECTIVE.md`](file:///home/zrhyan/Principal/Computation/Space%20Apps/general_strategy/ESTRATEGIA_TREND_DETECTIVE.md#L358) (*"5. Rigor: como garantimos que não é ruído"*), `NARR` pode usar um argumento matador diretamente inspirado nesta base de conhecimento:

> **Sugestão de Fala para o Pitch (Forte Impacto nos Jurados Cientistas da NASA):**
> *"A maioria das análises falha ao comparar apenas o início e o fim de uma série — sendo facilmente enganada por um ano de El Niño ou pela sazonalidade. O nosso motor estatístico isola primeiro as anomalias climatológicas e analisa a nuvem completa de 20 anos combinando regressão robusta de Theil-Sen, curvas aditivas generalizadas (GAM) para capturar acelerações físicas, filtragem bivariada de outliers por Distância de Mahalanobis e testes de significância corrigidos para memória climática ($\text{AR}(1)$) e falsos positivos espaciais (FDR). O resultado não é apenas um gráfico bonito: é ciência auditável."*
