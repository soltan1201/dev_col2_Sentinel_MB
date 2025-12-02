/**
 * @title App de Visualização de Filtros Sentinel-2 (Caatinga) - v2
 * @description Visualizador comparativo com Layout aprimorado e Rótulos de Bacias.
 * @author Expert GEE
 */

// --- 1. CONFIGURAÇÃO E ASSETS ---

// Importação de utilitários
var palettes = require('users/mapbiomas/modules:Palettes.js');
// Importando pacote para renderizar texto no mapa (Rótulos)
var text = require('users/gena/packages:text'); 

var classificationPalette = palettes.get('classification9');

// Fallback de paleta
if (!classificationPalette) {
    classificationPalette = [
        'ffffff', '129912', '1f4423', '006400', '32cd32', '339820', '29eee4', '77a605',
        '935132', 'bbfcac', '45c2a5', 'b8af4f', 'f1c232', 'ffffb2', 'ffd966', 'f6b26b',
        'f9965b', 'e07543', 'd6d6e0', 'c5c5e3', 'a5a5ce', '7c7cba', '5353a8', '2c2c94'
    ];
}

var vis = {
    mosaico: {
        min: 0,
        max: 2000,
        bands: ['red_median', 'green_median', 'blue_median']
    },
    map_class: {
        min: 0,
        max: 69,
        palette: classificationPalette
    }
};

var assets = {
    filters: {
        'Gap Fill': 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/Gap-fill',
        'Temporal Nativo': 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/TemporalN',
        'Temporal Anterior': 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/TemporalA',
        'Frequência': 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/Frequency',
        'Espacial': 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/Spatials',
        'Espacial Int': 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/Spatials_int'
    },
    regions: 'projects/mapbiomas-workspace/AMOSTRAS/col9/CAATINGA/bacias_hidrografica_caatinga_49_regions',
    caatinga: 'users/CartasSol/shapes/nCaatingaBff3000', // Novo asset adicionado
    mosaic_p1: 'projects/mapbiomas-mosaics/assets/SENTINEL/BRAZIL/mosaics-3', 
    mosaic_p2: 'projects/nexgenmap/MapBiomas2/SENTINEL/mosaics-3'             
};

var availableYears = ['2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'];
var availableVersions = ['1', '2', '3'];

// Lista de nomes/IDs para as bacias
var listaNameBacias = [
    '765', '7544', '7541', '7411', '746', '7591', '7592', 
    '761111', '761112', '7612', '7613', '7614', '7615', 
    '771', '7712', '772', '7721', '773', '7741', '7746', '7754', 
    '7761', '7764', '7691', '7581', '7625', '7584', '751',     
    '7616', '745', '7424', '7618', '7561', '755', '7617', 
    '7564', '7422', '76116', '7671', '757', '766', '753', '764',
    '7619', '7443', '7438', '763', '7622', '752'
];

// --- 2. PREPARAÇÃO DE DADOS ESPACIAIS ---

// Carregar Regiões
var regions = ee.FeatureCollection(assets.regions).map(function(feat){
    return feat.set('idCod', 1);
});
var mask_region = regions.reduceToImage(['idCod'], ee.Reducer.first());

// --- FIX 1: INJETAR OS IDS NAS REGIÕES ---
// Convertemos a coleção e a lista de nomes para Lists e fazemos um "zip" para unir.
var regionsList = regions.toList(100);
var namesList = ee.List(listaNameBacias);

// Proteção caso os tamanhos não batam (pega o menor)
var count = regionsList.size().min(namesList.size());
regionsList = regionsList.slice(0, count);

// Cria uma nova coleção com a propriedade 'label_id' definida
var regionsWithLabels = ee.FeatureCollection(regionsList.zip(namesList).map(function(pair) {
    var feat = ee.Feature(ee.List(pair).get(0));
    var idName = ee.String(ee.List(pair).get(1));
    return feat.set('label_id', idName);
}));

// Preparar Rótulos (Labels) usando o pacote 'text'
var scale = 5000; 

// Agora iteramos sobre a coleção CORRIGIDA
var labelImages = regionsWithLabels.map(function(feat) {
  var labelText = ee.String(feat.get('label_id'));
  var center = feat.geometry().centroid();
  
  // text.draw espera (geometry, labelString, scale, props)
  return text.draw(center, labelText, scale, {
    textColor: 'black',
    outlineColor: 'white',
    outlineWidth: 2,
    fontSize: 14,
    fontType: 'Arial'
  });
});

var labels = ee.ImageCollection(labelImages).mosaic();


// --- 3. INTERFACE DE USUÁRIO (UI) ---

var appState = {
    year: '2023',
    version: '1',
    activeLayers: {} 
};

// Inicializa estado
Object.keys(assets.filters).forEach(function(key) {
    appState.activeLayers[key] = (key === 'Espacial Int'); 
});

// -- Componentes de Mapa --
var leftMap = ui.Map();
var rightMap = ui.Map();

// Ocultar lista de camadas em AMBOS os mapas para limpar a interface
leftMap.setControlVisibility({layerList: false, zoomControl: false, mapTypeControl: false});
rightMap.setControlVisibility({layerList: false, zoomControl: true, mapTypeControl: true}); 

var linker = ui.Map.Linker([leftMap, rightMap]);

var splitPanel = ui.SplitPanel({
    firstPanel: leftMap,
    secondPanel: rightMap,
    wipe: true,
    style: {stretch: 'both'}
});

// -- Painel Lateral de Controle --
var controlPanel = ui.Panel({
    style: {width: '320px', padding: '10px', backgroundColor: '#f0f0f0'}
});

var title = ui.Label({
    value: 'Filtros Caatinga S2',
    style: {fontSize: '20px', fontWeight: 'bold', margin: '10px 0'}
});

// --- LAYOUT MELHORADO: Seletores em Linha ---
var selectionContainer = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal', margin: '10px 0'}
});

var selectYear = ui.Select({
    items: availableYears,
    value: appState.year,
    onChange: function(value) {
        appState.year = value;
        updateMaps();
    },
    style: {stretch: 'horizontal', margin: '0 10px 0 0'} // Margem direita
});

var selectVersion = ui.Select({
    items: availableVersions,
    value: appState.version,
    onChange: function(value) {
        appState.version = value;
        updateMaps();
    },
    style: {stretch: 'horizontal'}
});

// Adicionando rótulos e seletores ao container horizontal
selectionContainer.add(ui.Label('Ano:', {padding: '8px 4px 0 0', fontSize:'12px', fontWeight:'bold'}));
selectionContainer.add(selectYear);
selectionContainer.add(ui.Label('Versão:', {padding: '8px 4px 0 10px', fontSize:'12px', fontWeight:'bold'}));
selectionContainer.add(selectVersion);
// --------------------------------------------

var layerLabel = ui.Label('Camadas de Filtro:', {fontWeight: 'bold', margin: '20px 0 0 0'});

var checkboxesPanel = ui.Panel({style: {margin: '5px 0'}});

Object.keys(assets.filters).forEach(function(key) {
    var chk = ui.Checkbox({
        label: key,
        value: appState.activeLayers[key],
        onChange: function(checked) {
            appState.activeLayers[key] = checked;
            updateMaps(); 
        }
    });
    checkboxesPanel.add(chk);
});

// Montagem do Painel
controlPanel.add(title);
controlPanel.add(ui.Label('Controles de Visualização', {color: 'gray', fontSize:'10px'}));
controlPanel.add(selectionContainer); // Adiciona o container horizontal
controlPanel.add(layerLabel);
controlPanel.add(checkboxesPanel);
controlPanel.add(ui.Label('ℹ️ Esquerda: Mosaico | Direita: Classificação', {fontSize:'11px', color:'#555', margin:'20px 0 0 0'}));


// --- 4. LÓGICA DE ATUALIZAÇÃO ---

function getMosaicLayer(year) {
    var assetPath = assets.mosaic_p1;
    if (parseInt(year) > 2023) {
        assetPath = assets.mosaic_p2;
    }
    
    var mosaic = ee.ImageCollection(assetPath)
        .filter(ee.Filter.eq('year', parseInt(year)))
        .mosaic()
        .select(vis.mosaico.bands)
        .updateMask(mask_region);
        
    return mosaic;
}

function updateMaps() {
    var year = appState.year;
    var version = appState.version;
    var bandName = 'classification_' + year;

    // 1. Atualizar Mapa Esquerdo
    leftMap.layers().reset();
    var mosaicImg = getMosaicLayer(year);
    leftMap.addLayer(mosaicImg, vis.mosaico, 'Mosaico');
    
    // Contorno Bacias (Preto)
    var empty = ee.Image().byte();
    var outline = empty.paint({
      featureCollection: regions,
      color: 1,
      width: 1
    });
    leftMap.addLayer(outline, {palette: '000000'}, 'Bacias Outline');

    // --- NOVA CAMADA: Limite Caatinga (Vermelho) ---
    var caatinga = ee.FeatureCollection(assets.caatinga);
    var caatingaOutline = empty.paint({
        featureCollection: caatinga,
        color: 1,
        width: 2 // Espessura maior para destaque
    });
    leftMap.addLayer(caatingaOutline, {palette: 'red'}, 'Limite Caatinga');
    
    // Adicionar Rótulos das Bacias (Visível)
    leftMap.addLayer(labels, {}, 'IDs Bacias');


    // 2. Atualizar Mapa Direito
    rightMap.layers().reset();
    
    Object.keys(assets.filters).forEach(function(filterName) {
        if (appState.activeLayers[filterName]) {
            var assetPath = assets.filters[filterName];
            var col = ee.ImageCollection(assetPath);
            
            // Tenta filtrar versão
            var imgFiltered = col.filter(ee.Filter.eq('version', parseInt(version)));
            
            // --- FIX 2: PREVENIR ERRO DE COLEÇÃO VAZIA ---
            // Se a coleção filtrada (versão/ano) estiver vazia, retorna imagem vazia para não quebrar o .select()
            var finalImage = ee.Image(ee.Algorithms.If(
                imgFiltered.size(), // Condição: Tamanho > 0
                imgFiltered.mosaic().select(bandName).updateMask(mask_region), // True: Processa normal
                ee.Image().byte() // False: Imagem vazia (transparente)
            ));
            
            rightMap.addLayer(finalImage, vis.map_class, filterName);
        }
    });
}

// --- 5. INICIALIZAÇÃO ---

ui.root.clear();
ui.root.add(controlPanel);
ui.root.add(splitPanel);

leftMap.centerObject(regions, 6);
updateMaps();

print("App v2 carregado.");