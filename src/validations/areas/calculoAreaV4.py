import ee
import sys

# Inicialização (ajuste o projeto conforme necessário)
try:
    # Se estiver rodando localmente, talvez precise de ee.Authenticate() antes
    ee.Initialize() 
    print('Earth Engine initialized successfully.')
except Exception as e:
    print(f'Failed to initialize Earth Engine: {e}')
    sys.exit(1)

# ================= CONFIGURAÇÕES =================

# Assets de Entrada
ASSET_BACIAS = 'projects/mapbiomas-workspace/AMOSTRAS/col9/CAATINGA/bacias_hidrografica_caatinga_49_regions'

# Escolha UM dos modos abaixo comentando/descomentando:

# MODO 1: Asset é uma IMAGEM ÚNICA com 40 bandas (classification_1985, classification_1986...)
ASSET_LULC = 'projects/mapbiomas-public/assets/brazil/lulc/collection10/mapbiomas_brazil_collection10_integration_v2'
IS_IMAGE_COLLECTION = False 

# MODO 2: Asset é uma IMAGE COLLECTION (ex: asset de classificação intermediária)
# ASSET_LULC = 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/POS-CLASS/transition'
# IS_IMAGE_COLLECTION = True
# VERSION_FILTER = 10 # Se for collection, filtrar por versão se necessário

# Parâmetros Gerais
SCALE = 30
PROPERTY_ID_BACIA = 'nunivotto4' # Nome da propriedade no shapefile que identifica a bacia
OUTPUT_FOLDER = 'AREA-EXPORT-OTIMIZADO'
OUTPUT_NAME = 'estatisticas_bacias_caatinga_v1'

# Listas de Remap (conforme seu script original)
CLASS_OLD = [0, 3, 4, 5, 6, 9, 11, 12, 13, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 62]
CLASS_NEW = [27, 3, 4, 3, 3, 3, 12, 12, 12, 21, 21, 21, 21, 21, 22, 22, 22, 22, 33, 29, 22, 33, 12, 33, 21, 33, 33, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 4, 12, 21]

# Lista de Bacias para filtrar (Opcional - se vazio processa todas do asset)
FILTER_BACIAS_IDS = [
    '7691', '7754', '7581', '7625', '7584', '751', '7614', 
    '7616', '745', '7424', '773', '7612', '7613', '765',
    '7618', '7561', '755', '7617', '7564', '761111','761112', 
    '7741', '7422', '76116', '7761', '7671', '7615', '7411', 
    '7764', '757', '771', '766', '7746', '753', '764', 
    '7541', '7721', '772', '7619', '7443','7544', '7438', 
    '763', '7591', '7592', '7622', '746','7712', '752'
]

# Anos para processar
YEARS = list(range(1985, 2025))

# ================= FUNÇÕES AUXILIARES =================

def get_lulc_image(year):
    """Retorna a imagem de classificação para um ano específico, com classes remapeadas."""
    year_str = ee.Number(year).format('%d')
    
    img = None
    
    if IS_IMAGE_COLLECTION:
        # Lógica para Coleção: Filtra por ano e (opcionalmente) versão/metadados
        col = ee.ImageCollection(ASSET_LULC)
        # Ajuste os filtros abaixo conforme a estrutura da sua coleção
        # Ex: col.filter(ee.Filter.eq('year', year)).mosaic()
        # No seu script original parecia filtrar por nome da banda ou propriedade
        
        # Assumindo que a coleção tem imagens com bandas 'classification_YYYY' ou similar
        # Ou filtrando por metadados 'year'
        col_year = col.filter(ee.Filter.eq('year', year)) # Ajustar propriedade se necessário
        img = col_year.mosaic().select(0) # Pega a primeira banda do mosaico
        
        # Fallback se a coleção não tiver propriedade 'year', tenta selecionar banda
        # img = col.select(f'classification_{year}').mosaic()
        
    else:
        # Lógica para Imagem Única (Multibanda)
        band_name = ee.String('classification_').cat(year_str)
        img = ee.Image(ASSET_LULC).select(band_name)

    # Aplica o Remap
    img_remap = img.remap(CLASS_OLD, CLASS_NEW).rename('class')
    
    # Adiciona a banda de área em hectares (divide por 10000)
    # scale=True garante que pixelArea use projeção correta na redução
    pixel_area = ee.Image.pixelArea().divide(10000).rename('area_ha')
    
    return img_remap.addBands(pixel_area)

def calculate_year_stats(year):
    """Função mapeada sobre a lista de anos."""
    year_num = ee.Number(year)
    
    # Prepara a imagem (Class + Area)
    image_input = get_lulc_image(year_num)
    
    # Redutor agrupado: Soma a banda 'area_ha' agrupado pela banda 'class'
    reducer = ee.Reducer.sum().group(
        groupField=0,  # A primeira banda é 'class'
        groupName='class',
        observedField='area_ha' # Nome da banda de área que entrou no reducer? Não, usa o input.
    )
    
    # Executa reduceRegions nas bacias
    # tileScale=4 ajuda a evitar erros de memória em geometrias complexas
    stats = image_input.reduceRegions(
        collection=regions,
        reducer=ee.Reducer.sum().group(1, 'class'), # Banda 0=class, Banda 1=area_ha. Agrupa por 0.
        scale=SCALE,
        tileScale=4 
    )
    
    # O resultado do reduceRegions adiciona uma propriedade 'groups' em cada feature (bacia)
    # Precisamos "desempacotar" essa lista de grupos para criar features individuais (linhas do CSV)
    
    def unpack_groups(feature):
        groups = ee.List(feature.get('groups'))
        
        def create_feat(item):
            item_dict = ee.Dictionary(item)
            class_val = item_dict.get('class')
            area_val = item_dict.get('sum')
            
            return ee.Feature(None, {
                'nome_bacia': feature.get(PROPERTY_ID_BACIA),
                'ano': year_num,
                'classe_cobertura': class_val,
                'area_ha': area_val
            })
            
        return groups.map(create_feat)

    # Flatten transforma a lista de listas de features em uma única lista plana
    return stats.map(unpack_groups).flatten()

# ================= EXECUÇÃO =================

print("Carregando bacias...")
regions = ee.FeatureCollection(ASSET_BACIAS)

# Filtrar bacias se a lista não estiver vazia
if FILTER_BACIAS_IDS:
    regions = regions.filter(ee.Filter.inList(PROPERTY_ID_BACIA, FILTER_BACIAS_IDS))

print(f"Total de bacias a processar: {regions.size().getInfo()}")

print("Configurando processamento server-side...")
# Mapeia a função sobre a lista de anos (processamento no servidor)
years_ee = ee.List(YEARS)
results_nested = years_ee.map(calculate_year_stats)

# O resultado é uma lista de FeatureCollections, precisamos achatar (flatten) numa única tabela
final_collection = ee.FeatureCollection(results_nested).flatten()

# Remove geometrias para deixar o CSV mais leve e rápido
final_collection = final_collection.select(['nome_bacia', 'ano', 'classe_cobertura', 'area_ha'], retainGeometry=False)

print("Iniciando tarefa de exportação...")

task = ee.batch.Export.table.toDrive(
    collection=final_collection,
    description=OUTPUT_NAME,
    folder=OUTPUT_FOLDER,
    fileFormat='CSV',
    selectors=['nome_bacia', 'ano', 'classe_cobertura', 'area_ha']
)

task.start()
print(f"Tarefa {OUTPUT_NAME} iniciada! Verifique a aba Tasks no Code Editor ou terminal.")