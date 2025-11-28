/**
 * VISUALIZAÇÃO COMPARATIVA: LANDSAT (Col10) vs SENTINEL-2 (Col10 Bacia)
 * Configuração: 3 Painéis (Ano-1, Ano, Ano+1)
 */

var palettes = require('users/mapbiomas/modules:Palettes.js');

// --- CONFIGURAÇÃO E ASSETS ---
var vis = {
    mosaico: {
        min: 0,
        max: 2000,
        bands: ['red_median', 'green_median', 'blue_median']
    },
    vismosaicoGEE: {
        'min': 0.001, 'max': 0.15,
        bands: ['red', 'green', 'blue']
    },
    map_class: {
        min: 0,
        max: 69,
        palette: palettes.get('classification9')
    }
};

var param = {
    // Seus novos assets
    asset_map_sentinel: 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/merger',
    asset_map_landsat: 'projects/mapbiomas-public/assets/brazil/lulc/collection10/mapbiomas_brazil_collection10_integration_v2',    
    // Assets auxiliares mantidos
    asset_bacias: 'projects/mapbiomas-workspace/AMOSTRAS/col9/CAATINGA/bacias_hidrografica_caatinga_49_regions',
    asset_biomas_raster: 'projects/mapbiomas-workspace/AUXILIAR/biomas-raster-41', 
    asset_mosaic_sentinelp2: 'projects/nexgenmap/MapBiomas2/SENTINEL/mosaics-3',
    asset_mosaic_sentinelp1: 'projects/mapbiomas-mosaics/assets/SENTINEL/BRAZIL/mosaics-3',
    asset_collectionId: 'LANDSAT/COMPOSITES/C02/T1_L2_32DAY',
    
    // Anos disponíveis
    nyears: [ '2016','2017','2018','2019','2020','2021','2022','2023','2024','2025' ],
};

// --- CARREGAMENTO DE DADOS ---
var bacias = ee.FeatureCollection(param.asset_bacias)   
                    .map(function(feat){return feat.set('idCod', 1)});
var imgLandsatCol10 = ee.Image(param.asset_map_landsat);
// Atenção: Este asset parece ser específico da Bacia 7622
var imgSentinelCol10 = ee.ImageCollection(param.asset_map_sentinel).mosaic(); 
print("Show mapss Sentinel ", imgSentinelCol10);


// --- INTERFACE ---
ui.root.clear(); 

// Painel lateral
var panel = ui.Panel({style: {width: '200px', stretch: 'vertical'}});
panel.add(ui.Label('Mapas Landsat vs Sentinel (S2)', {fontWeight: 'bold', fontSize: '18px'}));

// Seletor de Bacia
panel.add(ui.Label('Bacia Hidrográfica:'));
var selectBacia = ui.Select({
    placeholder: 'Carregando...', 
    style: {width: '95%'} 
});
panel.add(selectBacia);

// Slider de Ano
panel.add(ui.Label('Ano janela Central :'));
var sliderAno = ui.Slider({
    min: 2016,
    max: 2024,
    value: 2020, // Ajustado para pegar S2
    step: 1,
    style: {width: '95%'}
});
panel.add(sliderAno);

// Legenda de Assets
panel.add(ui.Label('Camadas:', {fontWeight: 'bold', margin: '10px 0 0 0'}));
panel.add(ui.Label('1. Landsat Col10 (Integration v2)'));
panel.add(ui.Label('2. Sentinel-2 (Version 1'));

// Widget de estilos
var stylesWidget = {
    labels: {fontWeight: 'bold', textAlign: 'center', backgroundColor: 'white', padding: '4px'},
    controlsVis: {layerList: true, zoomControl: false, mapTypeControl: false}
}

// --- CONSTRUÇÃO DOS MAPAS (3 PAINÉIS) ---
var mapAnt = ui.Map();
var mapAtual = ui.Map();
var mapPost = ui.Map();
ui.Map.Linker([mapAnt, mapAtual, mapPost]);

mapAnt.setControlVisibility(stylesWidget.controlsVis);
mapAtual.setControlVisibility(stylesWidget.controlsVis);
mapPost.setControlVisibility(stylesWidget.controlsVis);

// Títulos sobre os mapas
var tituloAnt = ui.Label('Ano anterior:', stylesWidget.labels);
var tituloAtual = ui.Label('Ano selecionado:', stylesWidget.labels);
var tituloPost = ui.Label('Ano posterior:', stylesWidget.labels);

// Adicionando títulos flutuantes nos mapas
mapAnt.add(tituloAnt);
mapAtual.add(tituloAtual);
mapPost.add(tituloPost);

// Layout Horizontal
var mapasHorizontal = ui.Panel({
    widgets: [mapAnt, mapAtual, mapPost], 
    layout: ui.Panel.Layout.Flow('horizontal'), 
    style: {stretch: 'both'}
});

var painelCompleto = ui.Panel({
    widgets: [panel, mapasHorizontal],
    layout: ui.Panel.Layout.Flow('horizontal'),
    style: {stretch: 'both'}
});

ui.root.add(painelCompleto);

// --- LÓGICA DE ATUALIZAÇÃO ---

// Arrays para rastrear camadas e remover depois
var camadasAnt = [];
var camadasAtual = [];
var camadasPost = [];

function atualizarInterface() {   
    // Limpa camadas antigas
    camadasAnt.forEach(function(layer) { mapAnt.layers().remove(layer); });
    camadasAtual.forEach(function(layer) { mapAtual.layers().remove(layer); });
    camadasPost.forEach(function(layer) { mapPost.layers().remove(layer); });
    camadasAnt = [];
    camadasAtual = [];
    camadasPost = [];

    var bacia_selected = selectBacia.getValue();
    var anoCentral = sliderAno.getValue();
    
    if (!bacia_selected) return;

    // Filtra e prepara a máscara da bacia
    var featBacia = bacias.filter(ee.Filter.eq('nunivotto4', bacia_selected));
    print("bacia selecionada ", featBacia);
    // Cria uma imagem raster para clipar visualmente (opcional, deixa mais limpo)
    var maskBacia = featBacia.reduceToImage(['idCod'], ee.Reducer.first());
    featBacia =featBacia.geometry();
    // Define os anos vizinhos
    var anosLocais = [
        Math.max(2016, anoCentral - 1),
        anoCentral,
        Math.min(2026, anoCentral + 1)
    ];

    // Atualiza Labels
    tituloAnt.setValue('Ano: ' + anosLocais[0]);
    tituloAtual.setValue('Ano: ' + anosLocais[1]);
    tituloPost.setValue('Ano: ' + anosLocais[2]);

    var maps = [mapAnt, mapAtual, mapPost];
    var listasCamadas = [camadasAnt, camadasAtual, camadasPost];
    // Mosaicos
    // var mosaicoCol9 = ee.ImageCollection(param.asset_mosaic);
    // var mosaicEE = ee.ImageCollection(param.asset_collectionId);

    // Loop para preencher os 3 mapas
    anosLocais.forEach(function(ano, i) {
        var map = maps[i];
        var listaCamadas = listasCamadas[i];
        
        // --- 1. Mosaico Landsat (Fundo) ---
        var mosaicoL8 = ee.ImageCollection(param.asset_collectionId)
                            .filterBounds(featBacia)
                            .filterDate(ee.Date.fromYMD(ano, 1, 1), ee.Date.fromYMD(ano, 12, 31))
                            .mosaic().updateMask(maskBacia);
        var layerMosaicoL8 = ui.Map.Layer(mosaicoL8, vis.vismosaicoGEE, 'Mosaico L8 ' + ano, false);
        
        // --- 1. Mosaico Sentinel (Fundo) ---
        var mosaicoS2 = null; 

        if (ano < 2024){ 
            mosaicoS2 = ee.ImageCollection(param.asset_mosaic_sentinelp1);
        }else{
            mosaicoS2 = ee.ImageCollection(param.asset_mosaic_sentinelp2)
        }
        mosaicoS2 = mosaicoS2.filterBounds(featBacia)
                            .filter(ee.Filter.eq('year', ano))
                            .mosaic().updateMask(maskBacia);
        var layerMosaicoS2 = ui.Map.Layer(mosaicoS2, vis.mosaico, 'Mosaico S2 ' + ano, false);
        
        // --- 2. Classificação LANDSAT Col 10 ---
        // Verifica se o ano está dentro do range do Landsat (geralmente ok 2016-2024)
        if (ano <= 2025) {
            var nomeBanda = 'classification_' + ano;
            var classLandsat = imgLandsatCol10.select([nomeBanda]).updateMask(maskBacia);
            var layerLandsat = ui.Map.Layer(classLandsat, vis.map_class, 'Landsat Col10 (' + ano + ')');
        }
        // --- 3. Classificação SENTINEL-2 ---
        // Sentinel geralmente começa em 2016 (alguns dados 2015).
        // Seu asset parece ter dados de 2016 em diante.
        var layerSentinel = null;
        //Ajuste conforme a disponibilidade real do seu asset S2
       // Tentativa de pegar a banda. Se o asset não tiver a banda, vai dar erro no Tile, 
       // mas o script roda.
       var classSentinel = imgSentinelCol10.select([nomeBanda]).updateMask(maskBacia);
       print("classe sentinel ", classSentinel);
       layerSentinel = ui.Map.Layer(classSentinel, vis.map_class, 'Sentinel-2 (' + ano + ')', true);
    

        // Centraliza mapa no painel do meio
        if (i === 1) {
            map.centerObject(featBacia, 10);
        }

        // Adiciona na ordem (Mosaico -> Landsat -> Sentinel)
        map.layers().add(layerMosaicoL8);
        map.layers().add(layerMosaicoS2);
        map.layers().add(layerLandsat);
        
        listaCamadas.push(layerMosaicoL8);
        listaCamadas.push(layerMosaicoS2);
        listaCamadas.push(layerLandsat);

        if (layerSentinel) {
            map.layers().add(layerSentinel);
            listaCamadas.push(layerSentinel);
        }
    });
}

// --- EVENTOS E INICIALIZAÇÃO ---
// lista de 49 bacias 
var nameBacias = [
    '765', '7544', '7541', '7411', '746', '7591', '7592', 
    '761111', '761112', '7612', '7613', '7614', '7615', 
    '771', '7712', '772', '7721', '773', '7741', '7746', '7754', 
    '7761', '7764',   '7691', '7581', '7625', '7584', '751', 
    '752', '7616', '745', '7424', '7618', '7561', '755', '7617', 
    '7564', '7422', '76116', '7671', '757', '766', '753', '764',
    '7619', '7443', '7438', '763', '7622'
]
// Preenche lista de bacias
ee.List(nameBacias).evaluate(function(codigos) {

    var opcoes = codigos.map(function(c) {
        return {label: String(c), value: c};
    });
    selectBacia.items().reset(opcoes);
    
    // Tenta setar a bacia 7622 (já que seu asset Sentinel é dessa bacia)
    // Se não existir na lista, pega a primeira.
    // var defaultBacia = '7622'; 
    // var existe = codigos.indexOf(parseInt(defaultBacia)) > -1 || codigos.indexOf(defaultBacia) > -1;
    
    // if (existe) {
    //     selectBacia.setValue(defaultBacia);
    // } else {
    //     selectBacia.setValue(selectBacia.items().get(0).value);
    // }
});

selectBacia.onChange(atualizarInterface);
sliderAno.onChange(atualizarInterface);