"""Catálogo estruturado das 7 Famílias Ambientais e 42 códigos de variáveis.

Fonte normativa: `context/knowledge_data/environmental_family.md`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class EnvironmentalFamily:
    """Representa uma família temática de investigação ambiental na UI."""

    family_id: str
    order: int
    name: str
    investigation_focus: str


@dataclass(frozen=True)
class VariableSpec:
    """Metadados operacionais, físicos e de roteamento de uma variável ambiental."""

    code: str
    family_id: str
    ui_name: str
    connector_id: str  # nasa_power | open_meteo_flood | noaa_cdo | nasa_appeears | nasa_giovanni
    source_label: str
    mode: str  # realtime | queue_cache | validation_demo
    unit: str
    raw_unit: str
    scale_type: str  # interval | ratio
    description: str
    grid_type: str = "merra2"  # merra2 | ceres | point | station | modis | gldas
    product_id: str | None = None
    extra_note: str | None = None

    @property
    def allow_percentage_change(self) -> bool:
        """Variáveis em escala intervalar (ex.: °C, NDVI) não aceitam variação em %."""
        return self.scale_type == "ratio"

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["allow_percentage_change"] = self.allow_percentage_change
        return payload


ENVIRONMENTAL_FAMILIES: tuple[EnvironmentalFamily, ...] = (
    EnvironmentalFamily(
        family_id="temperatura_calor",
        order=1,
        name="Temperatura e Calor (Atmosfera e Superfície)",
        investigation_focus="Aquecimento global, ondas de calor, ilhas de calor urbanas e mudanças na amplitude térmica.",
    ),
    EnvironmentalFamily(
        family_id="chuva_umidade",
        order=2,
        name="Chuva e Umidade Atmosférica",
        investigation_focus="Alterações no regime de chuvas, secas meteorológicas, tempestades e aridez do ar.",
    ),
    EnvironmentalFamily(
        family_id="solo_seca_evapotranspiracao",
        order=3,
        name="Solo, Seca Agrícola e Evapotranspiração",
        investigation_focus="Desertificação, disponibilidade de água para lavouras/florestas e estresse hídrico subterrâneo.",
    ),
    EnvironmentalFamily(
        family_id="rios_vazao_bacias",
        order=4,
        name="Rios, Vazão e Bacias Hidrográficas",
        investigation_focus="Enchentes severas, redução histórica do volume de rios e impacto de barragens/uso da terra.",
    ),
    EnvironmentalFamily(
        family_id="vegetacao_florestas_uso_terra",
        order=5,
        name="Vegetação, Florestas e Uso da Terra",
        investigation_focus="Desmatamento, regeneração florestal, impacto de queimadas e vigor da biomassa.",
    ),
    EnvironmentalFamily(
        family_id="radiacao_nuvens_ventos",
        order=6,
        name="Radiação Solar, Nuvens, Ventos e Atmosfera",
        investigation_focus="Potencial de energia solar/eólica, nebulosidade, circulação de ventos e poluição/queimadas.",
    ),
    EnvironmentalFamily(
        family_id="estacoes_meteorologicas_solo",
        order=7,
        name="Estações Meteorológicas em Solo (Validação Local)",
        investigation_focus="Confrontar estimativas de satélites e modelos globais com medições físicas em estações terrestres.",
    ),
)

_VARIABLES: tuple[VariableSpec, ...] = (
    # Família 1 — Temperatura e Calor
    VariableSpec(
        code="T2M",
        family_id="temperatura_calor",
        ui_name="Temperatura Média do Ar (2m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Temperatura média do ar na altura humana (2 metros). Principal indicador de aquecimento climático.",
    ),
    VariableSpec(
        code="T2M_MAX",
        family_id="temperatura_calor",
        ui_name="Temperatura Máxima do Ar (2m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Picos de calor extremo registrados em cada mês.",
    ),
    VariableSpec(
        code="T2M_MIN",
        family_id="temperatura_calor",
        ui_name="Temperatura Mínima do Ar (2m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Madrugadas mais frias; se estiver subindo rápido, indica retenção de calor noturno.",
    ),
    VariableSpec(
        code="T2M_RANGE",
        family_id="temperatura_calor",
        ui_name="Amplitude Térmica Diária",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Diferença entre a máxima e a mínima diária. Mudanças bruscas afetam safras agrícolas e ecossistemas.",
    ),
    VariableSpec(
        code="TS",
        family_id="temperatura_calor",
        ui_name="Temperatura da Superfície (Solo/Piso)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description='Temperatura da "pele" da Terra (asfalto, solo exposto, copa das árvores).',
    ),
    VariableSpec(
        code="LST_Day_CMG",
        family_id="temperatura_calor",
        ui_name="Temp. de Superfície Diurna (Satélite)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MODIS)",
        mode="queue_cache",
        unit="°C",
        raw_unit="K",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD11C3.061",
        description="Medição térmica de alta resolução (5 km) durante o dia. Excelente para detectar ilhas de calor urbanas.",
    ),
    VariableSpec(
        code="LST_Night_CMG",
        family_id="temperatura_calor",
        ui_name="Temp. de Superfície Noturna (Satélite)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MODIS)",
        mode="queue_cache",
        unit="°C",
        raw_unit="K",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD11C3.061",
        description="Medição térmica noturna por satélite; mostra o quanto o solo ou a cidade demora para esfriar à noite.",
    ),
    VariableSpec(
        code="T2MDEW",
        family_id="temperatura_calor",
        ui_name="Ponto de Orvalho (2m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        description="Temperatura em que o vapor d'água condensa; ligada à sensação de abafamento e formação de neblina.",
    ),
    # Família 2 — Chuva e Umidade Atmosférica
    VariableSpec(
        code="PRECTOTCORR",
        family_id="chuva_umidade",
        ui_name="Precipitação Total Corrigida (Chuva)",
        connector_id="nasa_power",
        source_label="NASA POWER (GPM/MERRA-2)",
        mode="realtime",
        unit="mm/mês",
        raw_unit="mm/day",
        scale_type="ratio",
        description="Volume de chuva combinando satélite e pluviômetros. Mostra se está chovendo mais ou menos na região.",
        extra_note="Convertido de mm/day para mm/mês multiplicando pelos dias reais do mês.",
    ),
    VariableSpec(
        code="GPM_3IMERGM",
        family_id="chuva_umidade",
        ui_name="Precipitação por Satélite (Alta Res.)",
        connector_id="nasa_giovanni",
        source_label="Giovanni (IMERG V07)",
        mode="validation_demo",
        unit="mm/mês",
        raw_unit="mm/month",
        scale_type="ratio",
        grid_type="gldas",
        product_id="GPM_3IMERGM",
        description="Grade fina (0,1°) do satélite GPM. Ideal para validar tendências regionais de precipitação.",
    ),
    VariableSpec(
        code="RH2M",
        family_id="chuva_umidade",
        ui_name="Umidade Relativa do Ar (2m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="%",
        raw_unit="%",
        scale_type="ratio",
        description="Percentual de saturação de vapor no ar. Quedas contínuas ao longo das décadas indicam aridificação.",
    ),
    VariableSpec(
        code="QV2M",
        family_id="chuva_umidade",
        ui_name="Umidade Específica do Ar (2m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="g/kg",
        raw_unit="g/kg",
        scale_type="ratio",
        description="Massa real de vapor d'água presente no ar (independente da variação de temperatura).",
    ),
    VariableSpec(
        code="TQV",
        family_id="chuva_umidade",
        ui_name="Água Precipitável na Atmosfera",
        connector_id="nasa_power",
        source_label="NASA POWER / Giovanni",
        mode="realtime",
        unit="kg/m² (mm)",
        raw_unit="kg/m^2",
        scale_type="ratio",
        description="Quantidade total de vapor d'água na coluna atmosférica; indica potencial para chuvas intensas.",
    ),
    # Família 3 — Solo, Seca Agrícola e Evapotranspiração
    VariableSpec(
        code="GWETTOP",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Umidade Superficial do Solo",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2 Land)",
        mode="realtime",
        unit="Fração (0 a 1)",
        raw_unit="1",
        scale_type="ratio",
        description="Grau de saturação de água nos primeiros 5 cm de terra (0 = totalmente seco, 1 = solo saturado).",
        extra_note="Retorna -999 no oceano; tratado como NaN.",
    ),
    VariableSpec(
        code="GWETROOT",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Umidade na Zona das Raízes",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2 Land)",
        mode="realtime",
        unit="Fração (0 a 1)",
        raw_unit="1",
        scale_type="ratio",
        description="Água disponível até ~1 metro de profundidade, onde as raízes das plantas e lavouras absorvem água.",
        extra_note="Retorna -999 no oceano; tratado como NaN.",
    ),
    VariableSpec(
        code="GWETPROF",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Umidade Profunda do Solo (Perfil)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2 Land)",
        mode="realtime",
        unit="Fração (0 a 1)",
        raw_unit="1",
        scale_type="ratio",
        description="Reserva hídrica total do perfil do solo até o lençol freático superficial.",
        extra_note="Retorna -999 no oceano; tratado como NaN.",
    ),
    VariableSpec(
        code="Evap_tavg",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Evapotranspiração Total",
        connector_id="nasa_giovanni",
        source_label="Giovanni / GLDAS_NOAH",
        mode="validation_demo",
        unit="mm/dia",
        raw_unit="kg m-2 s-1",
        scale_type="ratio",
        grid_type="gldas",
        product_id="GLDAS_NOAH025_M",
        description="Soma da água que evapora do solo + transpiração das plantas. Se sobe enquanto a chuva cai, acelera a seca.",
    ),
    VariableSpec(
        code="Qs_acc",
        family_id="solo_seca_evapotranspiracao",
        ui_name="Escoamento Superficial (Runoff)",
        connector_id="nasa_giovanni",
        source_label="Giovanni / GLDAS_NOAH",
        mode="validation_demo",
        unit="kg/m²",
        raw_unit="kg/m^2",
        scale_type="ratio",
        grid_type="gldas",
        product_id="GLDAS_NOAH025_M",
        description="Água da chuva que não infiltra no solo e escorre para os rios (aumenta com impermeabilização e desmatamento).",
    ),
    # Família 4 — Rios, Vazão e Bacias Hidrográficas
    VariableSpec(
        code="river_discharge",
        family_id="rios_vazao_bacias",
        ui_name="Vazão do Rio (Série Histórica)",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Volume de água passando pelo canal do rio a cada segundo. Detecta se o rio está perdendo volume nas últimas décadas.",
    ),
    VariableSpec(
        code="river_discharge_mean",
        family_id="rios_vazao_bacias",
        ui_name="Vazão Média do Rio",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Comportamento médio do fluxo hídrico para comparar anos regulares contra anos extremos.",
    ),
    VariableSpec(
        code="river_discharge_max",
        family_id="rios_vazao_bacias",
        ui_name="Pico Máximo de Cheia",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Avalia se as cheias e inundações extremas estão ficando mais volumosas a cada década.",
    ),
    VariableSpec(
        code="river_discharge_min",
        family_id="rios_vazao_bacias",
        ui_name="Vazão Mínima Crítica (Estiagem)",
        connector_id="open_meteo_flood",
        source_label="Open-Meteo Flood (GloFAS)",
        mode="realtime",
        unit="m³/s",
        raw_unit="m³/s",
        scale_type="ratio",
        grid_type="point",
        description="Mede o nível mais crítico que o rio atinge na estação seca (essencial para abastecimento e hidroelétricas).",
    ),
    # Família 5 — Vegetação, Florestas e Uso da Terra
    VariableSpec(
        code="_1_km_monthly_NDVI",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Índice de Vegetação (NDVI)",
        connector_id="nasa_appeears",
        source_label="AppEEARS / Giovanni (MOD13A3)",
        mode="queue_cache",
        unit="Índice (-1 a +1)",
        raw_unit="NDVI",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD13A3.061",
        description='Mede o "verdor" e a densidade de folhas verdes. Quedas significativas indicam desmatamento ou degradação.',
    ),
    VariableSpec(
        code="_1_km_monthly_EVI",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Índice de Vegetação Melhorado (EVI)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MOD13A3)",
        mode="queue_cache",
        unit="Índice (-1 a +1)",
        raw_unit="EVI",
        scale_type="interval",
        grid_type="modis",
        product_id="MOD13A3.061",
        description="Similar ao NDVI, mas não satura em florestas muito densas (ideal para monitorar Amazônia e Mata Atlântica).",
    ),
    VariableSpec(
        code="Lai_500m",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Índice de Área Foliar (LAI)",
        connector_id="nasa_appeears",
        source_label="AppEEARS (MOD15A2H)",
        mode="queue_cache",
        unit="m²/m²",
        raw_unit="m²/m²",
        scale_type="ratio",
        grid_type="modis",
        product_id="MOD15A2H.061",
        description="Quantidade de camadas de folhas sobre o solo; mede a densidade estrutural da floresta ou safra.",
    ),
    VariableSpec(
        code="ALLSKY_SRF_ALB",
        family_id="vegetacao_florestas_uso_terra",
        ui_name="Albedo da Superfície",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="Fração (0 a 1)",
        raw_unit="1",
        scale_type="ratio",
        grid_type="ceres",
        description="Fração de luz solar refletida pelo solo. Quando uma floresta vira pasto/cidade ou o gelo derrete, o albedo muda.",
    ),
    # Família 6 — Radiação Solar, Nuvens, Ventos e Atmosfera
    VariableSpec(
        code="ALLSKY_SFC_SW_DWN",
        family_id="radiacao_nuvens_ventos",
        ui_name="Radiação Solar Incidente",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="MJ/m²/dia",
        raw_unit="MJ/m^2/day",
        scale_type="ratio",
        grid_type="ceres",
        description="Energia solar que chega ao solo (considerando nuvens). Fundamental para agricultura e energia fotovoltaica.",
    ),
    VariableSpec(
        code="CLRSKY_SFC_SW_DWN",
        family_id="radiacao_nuvens_ventos",
        ui_name="Radiação Solar de Céu Limpo",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="MJ/m²/dia",
        raw_unit="MJ/m^2/day",
        scale_type="ratio",
        grid_type="ceres",
        description="Radiação solar sem interferência de nuvens; quedas indicam presença de fumaça ou poluição atmosférica.",
    ),
    VariableSpec(
        code="ALLSKY_SFC_LW_DWN",
        family_id="radiacao_nuvens_ventos",
        ui_name="Radiação Infravermelha (Efeito Estufa)",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="MJ/m²/dia",
        raw_unit="MJ/m^2/day",
        scale_type="ratio",
        grid_type="ceres",
        description="Radiação térmica emitida pela atmosfera de volta para o solo (ligada à retenção de calor e efeito estufa).",
    ),
    VariableSpec(
        code="CLOUD_AMT",
        family_id="radiacao_nuvens_ventos",
        ui_name="Cobertura de Nuvens",
        connector_id="nasa_power",
        source_label="NASA POWER (CERES)",
        mode="realtime",
        unit="%",
        raw_unit="%",
        scale_type="ratio",
        grid_type="ceres",
        description="Porcentagem média do céu coberto por nuvens ao longo dos meses e décadas.",
    ),
    VariableSpec(
        code="WS2M",
        family_id="radiacao_nuvens_ventos",
        ui_name="Velocidade do Vento (2m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        description="Velocidade média do vento próximo ao solo (2m, afeta evaporação e conforto térmico).",
    ),
    VariableSpec(
        code="WS10M",
        family_id="radiacao_nuvens_ventos",
        ui_name="Velocidade do Vento (10m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        description="Velocidade média do vento na altura meteorológica padrão (10m).",
    ),
    VariableSpec(
        code="WS50M",
        family_id="radiacao_nuvens_ventos",
        ui_name="Velocidade do Vento p/ Turbinas (50m)",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        description="Vento na altura de aerogeradores; revela se o potencial de geração eólica está mudando na região.",
    ),
    VariableSpec(
        code="PS",
        family_id="radiacao_nuvens_ventos",
        ui_name="Pressão Atmosférica na Superfície",
        connector_id="nasa_power",
        source_label="NASA POWER (MERRA-2)",
        mode="realtime",
        unit="kPa",
        raw_unit="kPa",
        scale_type="interval",
        description="Peso da coluna de ar; tendências de longo prazo indicam mudanças em sistemas de alta/baixa pressão.",
    ),
    VariableSpec(
        code="AOD_550",
        family_id="radiacao_nuvens_ventos",
        ui_name="Espessura Óptica de Aerossóis (Fumaça)",
        connector_id="nasa_giovanni",
        source_label="Giovanni (MODIS MOD08_M3)",
        mode="validation_demo",
        unit="Adimensional",
        raw_unit="1",
        scale_type="ratio",
        grid_type="gldas",
        product_id="MOD08_M3",
        description="Mede partículas suspensas no ar (plumas de fumaça de queimadas, poeira desértica e poluição urbana).",
    ),
    # Família 7 — Estações Meteorológicas em Solo (NOAA CDO)
    VariableSpec(
        code="PRCP",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Chuva na Estação (Pluviômetro)",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="mm",
        raw_unit="mm",
        scale_type="ratio",
        grid_type="station",
        description="Água acumulada medida fisicamente dentro do coletor da estação meteorológica local.",
    ),
    VariableSpec(
        code="TAVG",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Temperatura Média na Estação",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        grid_type="station",
        description="Temperatura média registrada pelo termômetro físico oficial da estação terrestre.",
    ),
    VariableSpec(
        code="TMAX",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Temperatura Máxima na Estação",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        grid_type="station",
        description="Extremo máximo térmico medido fisicamente no abrigo meteorológico local.",
    ),
    VariableSpec(
        code="TMIN",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Temperatura Mínima na Estação",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="°C",
        raw_unit="C",
        scale_type="interval",
        grid_type="station",
        description="Extremo mínimo térmico medido fisicamente no abrigo meteorológico local.",
    ),
    VariableSpec(
        code="SNOW",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Queda de Neve (Estação)",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="mm",
        raw_unit="mm",
        scale_type="ratio",
        grid_type="station",
        description="Neve precipitada registrada na estação meteorológica terrestre.",
    ),
    VariableSpec(
        code="SNWD",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Acúmulo de Neve no Solo",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="mm",
        raw_unit="mm",
        scale_type="ratio",
        grid_type="station",
        description="Profundidade acumulada de neve no solo (útil para investigar derretimento em cordilheiras/regiões frias).",
    ),
    VariableSpec(
        code="AWND",
        family_id="estacoes_meteorologicas_solo",
        ui_name="Velocidade Média do Vento (Solo)",
        connector_id="noaa_cdo",
        source_label="NOAA CDO API v2 (GSOM)",
        mode="realtime",
        unit="m/s",
        raw_unit="m/s",
        scale_type="ratio",
        grid_type="station",
        description="Velocidade média do vento medida diretamente pelo anemômetro físico da estação.",
    ),
)

_VARIABLES_BY_CODE: dict[str, VariableSpec] = {spec.code: spec for spec in _VARIABLES}
_FAMILIES_BY_ID: dict[str, EnvironmentalFamily] = {fam.family_id: fam for fam in ENVIRONMENTAL_FAMILIES}


def get_variable_spec(code: str) -> VariableSpec:
    """Retorna os metadados de uma variável do catálogo pelo código oficial da API."""
    if code not in _VARIABLES_BY_CODE:
        supported = ", ".join(sorted(_VARIABLES_BY_CODE))
        raise KeyError(f"Variável '{code}' não encontrada no catálogo ambiental. Suportadas: {supported}")
    return _VARIABLES_BY_CODE[code]


def list_variables_by_family(family_id: str) -> list[VariableSpec]:
    """Lista todas as variáveis pertencentes a uma Família Ambiental."""
    if family_id not in _FAMILIES_BY_ID:
        supported = ", ".join(_FAMILIES_BY_ID)
        raise KeyError(f"Família '{family_id}' desconhecida. Opções: {supported}")
    return [spec for spec in _VARIABLES if spec.family_id == family_id]


def get_catalog_tree() -> dict[str, Any]:
    """Retorna o catálogo completo organizado em árvore das 7 Famílias (pronto para UI/API)."""
    families_payload = []
    for fam in sorted(ENVIRONMENTAL_FAMILIES, key=lambda item: item.order):
        fam_vars = [spec.to_dict() for spec in list_variables_by_family(fam.family_id)]
        families_payload.append({
            **asdict(fam),
            "variables_count": len(fam_vars),
            "variables": fam_vars,
        })
    return {
        "total_families": len(families_payload),
        "total_variables": len(_VARIABLES),
        "families": families_payload,
    }
