/**
 * VISUALIZAÇÃO INTERATIVA: LANDSAT Col10 vs SENTINEL-2 (COM MOSAICOS)
 * Período: 2016 - 2025
 */

var palettes = require('users/mapbiomas/modules:Palettes.js');
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

// --- DEFINIÇÃO DOS ASSETS ---
var param = {
    // Classificações
    asset_map_sentinel: 'projects/mapbiomas-workspace/AMOSTRAS/col10/CAATINGA/S2/POS-CLASS/merger',
    asset_map_landsat: 'projects/mapbiomas-public/assets/brazil/lulc/collection10/mapbiomas_brazil_collection10_integration_v2',     
    
    // Auxiliares
    asset_bacias: 'projects/mapbiomas-workspace/AMOSTRAS/col9/CAATINGA/bacias_hidrografica_caatinga_49_regions',
    asset_biomas_raster: 'projects/mapbiomas-workspace/AUXILIAR/biomas-raster-41', 
    
    // Mosaicos Visuais
    asset_mosaic_sentinelp2: 'projects/nexgenmap/MapBiomas2/SENTINEL/mosaics-3',
    asset_mosaic_sentinelp1: 'projects/mapbiomas-mosaics/assets/SENTINEL/BRAZIL/mosaics-3',
    asset_collectionId: 'LANDSAT/COMPOSITES/C02/T1_L2_32DAY', // Landsat Raw
    
    nyears: [ '2016','2017','2018','2019','2020','2021','2022','2023','2024','2025' ],
};

// --- CARREGAMENTO DAS IMAGENS DE CLASSIFICAÇÃO ---
var mapLandsat = ee.Image(param.asset_map_landsat);

// Sentinel: Como é uma pasta ("merger"), carregamos como coleção e fazemos o mosaico
var mapSentinel = ee.ImageCollection(param.asset_map_sentinel).mosaic(); 

// --- CONFIGURAÇÃO DE BACIAS E MÁSCARAS ---
var bacias = ee.FeatureCollection(param.asset_bacias)
                 .map(function(feat){return feat.set('idCod', 1)});

// Cria máscara visual (opcional)
var maskBacia = bacias.reduceToImage(['idCod'], ee.Reducer.first());

// Centraliza na bacia 7622 (Exemplo)
var baciaFoco = bacias.filter(ee.Filter.eq('nunivotto4', '7622')); 
Map.centerObject(baciaFoco, 10);

// --- INTERFACE ---
Map.setOptions('HYBRID');
Map.style().set('cursor', 'crosshair');

// Painéis
var legendPanel = ui.Panel({
    style: {
        position: 'bottom-left',
        width: '450px',
        height: '400px',
        padding: '8px',
        shown: false 
    }
});
Map.add(legendPanel);

var inspectorPanel = ui.Panel({style: {position: 'top-right'}});
Map.add(inspectorPanel);

// --- FUNÇÃO DE GRÁFICO (CLIQUE) ---
function getCollectionFromBands(image, label, region) {
    var years = ee.List.sequence(2016, 2025);
    var imageList = years.map(function(y) {
        var yearStr = ee.Number(y).format('%.0f');
        var bandName = ee.String('classification_').cat(yearStr);
        
        return ee.Algorithms.If(
            image.bandNames().contains(bandName),
            image.select([bandName], ['classification'])
                 .set('year', y)
                 .set('source', label),
            null
        );
    });
    return ee.ImageCollection(imageList.removeAll([null]));
}

Map.onClick(function(coords) {
    legendPanel.style().set('shown', true);
    legendPanel.clear();
    legendPanel.add(ui.Label('Carregando...', {color: 'gray'}));
    
    var point = ee.Geometry.Point(coords.lon, coords.lat);
    
    // Ponto vermelho (Camada 4 - topo)
    var dot = ui.Map.Layer(point, {color: 'red'}, 'Ponto Clicado');
    Map.layers().set(4, dot); 

    var colLandsat = getCollectionFromBands(mapLandsat, 'Landsat', point);
    var colSentinel = getCollectionFromBands(mapSentinel, 'Sentinel', point);
    var mergedCol = colLandsat.merge(colSentinel);

    var chart = ui.Chart.image.seriesByRegion({
        imageCollection: mergedCol,
        regions: point,
        reducer: ee.Reducer.first(),
        band: 'classification',
        scale: 30,
        xProperty: 'year',
        seriesProperty: 'source'
    })
    .setChartType('ScatterChart')
    .setOptions({
        title: 'Trajetória: Landsat vs Sentinel',
        vAxis: {title: 'Classe', format: '0'},
        hAxis: {title: 'Ano', format: '####'},
        lineWidth: 2,
        pointSize: 5,
        series: {
            0: {color: 'blue', labelInLegend: 'Landsat'},
            1: {color: 'red', labelInLegend: 'Sentinel'}
        }
    });

    legendPanel.clear();
    legendPanel.add(chart);
    inspectorPanel.clear();
    inspectorPanel.add(ui.Label('Lat: ' + coords.lat.toFixed(5) + ' Lon: ' + coords.lon.toFixed(5)));
});

// --- SLIDER ---
var labelTitle = ui.Label('Seletor de Ano (2016-2025)', {fontWeight: 'bold'});
var sliderAno = ui.Slider({
    min: 2016,
    max: 2025,
    value: 2020,
    step: 1,
    style: {stretch: 'horizontal', width: '300px'},
    onChange: updateLayers
});

var panelSlider = ui.Panel({
    widgets: [labelTitle, sliderAno],
    layout: ui.Panel.Layout.flow('vertical'),
    style: {position: 'bottom-right', width: '320px', padding: '10px'}
});
Map.add(panelSlider);

// --- ATUALIZAÇÃO DAS CAMADAS ---
function updateLayers() {
    var year = sliderAno.getValue();
    var bandName = 'classification_' + year;
    labelTitle.setValue('Visualizando Ano: ' + year);

    // 1. MOSAICO LANDSAT (Raw Composite)
    var mosaicoL8 = ee.ImageCollection(param.asset_collectionId)
                        .filterBounds(baciaFoco.geometry()) // Otimização espacial
                        .filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year, 12, 31))
                        .median() // Alterado de mosaic() para median() para reduzir nuvens
                        .updateMask(maskBacia)
                        .select(['red', 'green', 'blue']);

    var layerLandsatMos = ui.Map.Layer(mosaicoL8, vis.vismosaicoGEE, '1. Mosaico Landsat (' + year + ')', false);

    // 2. MOSAICO SENTINEL (Lógica condicional de assets)
    var colS2 = (year < 2024) 
        ? ee.ImageCollection(param.asset_mosaic_sentinelp1) 
        : ee.ImageCollection(param.asset_mosaic_sentinelp2);
        
    var mosaicoS2 = colS2.select(['red_median', 'green_median', 'blue_median'])
                         .filterBounds(baciaFoco.geometry())
                         .filter(ee.Filter.eq('year', year))
                         .mosaic()
                         .updateMask(maskBacia);
                         
    var layerSentinelMos = ui.Map.Layer(mosaicoS2, vis.mosaico, '2. Mosaico Sentinel (' + year + ')', false);   

    // 3. CLASSIFICAÇÃO LANDSAT
    var layerLandsatClass = ui.Map.Layer(
        mapLandsat.select(bandName).updateMask(maskBacia), 
        vis.map_class, 
        '3. Class. Landsat (' + year + ')'
    );

    // 4. CLASSIFICAÇÃO SENTINEL
    // Simplesmente tenta selecionar a banda. Se não existir no mosaico, fica transparente.
    var layerSentinelClass = ui.Map.Layer(
        mapSentinel.select(bandName).updateMask(maskBacia), 
        vis.map_class, 
        '4. Class. Sentinel (' + year + ')'
    );

    // --- ORDEM NO MAPA ---
    // Índices baixos = Fundo // Índices altos = Topo
    Map.layers().set(0, layerLandsatMos);   // Fundo
    Map.layers().set(1, layerSentinelMos);  // Fundo
    Map.layers().set(2, layerLandsatClass); // Meio (Transparente onde tem nodata)
    Map.layers().set(3, layerSentinelClass);// Topo
}

// Inicializa
updateLayers();