//= require jquery.simulate
//= require algoliaSearch

OSM.Search = function(map) {
  $(".search_form input[name=query]")
    .on("keyup", function triggerAlgoliaSearch( e ){
      OSM.algoliaIntegration.keyupHandler( e, map );
    })
    .on("keydown", function clear( e ){
      OSM.algoliaIntegration.keydownHandler( e );
    })
    .on("blur", function blur( e ){
      OSM.algoliaIntegration.blurHandler( e );
    })
    .on("input", function(e) {
      if ($(e.target).val() == "") {
        $(".describe_location").fadeIn(100);
      } else {
        $(".describe_location").fadeOut(100);
      }
    })

  $("#sidebar_content")
    .on("click", ".search_more a", clickSearchMore)
    .on("click", ".search_results_entry a.set_position", clickSearchResult)
    .on("mouseover", "p.search_results_entry:has(a.set_position)", showSearchResult)
    .on("mouseout", "p.search_results_entry:has(a.set_position)", hideSearchResult)
    .on("mousedown", "p.search_results_entry:has(a.set_position)", function () {
      var moved = false;
      $(this).one("click", function (e) {
        if (!moved && !$(e.target).is('a')) {
          $(this).find("a.set_position").simulate("click", e);
        }
      }).one("mousemove", function () {
        moved = true;
      });
    });

  function clickSearchMore(e) {
    e.preventDefault();
    e.stopPropagation();

    var div = $(this).parents(".search_more");

    $(this).hide();
    div.find(".loader").show();

    $.get($(this).attr("href"), function(data) {
      div.replaceWith(data);
    });
  }

  function showSearchResult(e) {
    var marker = $(this).data("marker");

    if (!marker) {
      var data = $(this).find("a.set_position").data();

      marker = L.marker([data.lat, data.lon], {icon: getUserIcon()});

      $(this).data("marker", marker);
    }

    markers.addLayer(marker);

    $(this).closest("li").addClass("selected");
  }

  function hideSearchResult(e) {
    var marker = $(this).data("marker");

    if (marker) {
      markers.removeLayer(marker);
    }

    $(this).closest("li").removeClass("selected");
  }

  function clickSearchResult(e) {
    var data = $(this).data(),
      center = L.latLng(data.lat, data.lon);

    if (data.minLon && data.minLat && data.maxLon && data.maxLat) {
      map.fitBounds([[data.minLat, data.minLon], [data.maxLat, data.maxLon]]);
    } else {
      map.setView(center, data.zoom);
    }

    // Let clicks to object browser links propagate.
    if (data.type && data.id) return;

    e.preventDefault();
    e.stopPropagation();
  }

  var markers = L.layerGroup().addTo(map);

  var page = {};

  page.pushstate = page.popstate = function(path) {
    var params = querystring.parse(path.substring(path.indexOf('?') + 1));
    $(".search_form input[name=query]").val(params.query);
    OSM.loadSidebarContent(path, page.load);
  };

  page.load = function() {
    $(".search_results_entry").each(function() {
      var entry = $(this);
      $.ajax({
        url: entry.data("href"),
        method: 'GET',
        data: {
          zoom: map.getZoom(),
          minlon: map.getBounds().getWest(),
          minlat: map.getBounds().getSouth(),
          maxlon: map.getBounds().getEast(),
          maxlat: map.getBounds().getNorth()
        },
        success: function(html) {
          entry.html(html);
        }
      });
    });

    return map.getState();
  };

  page.unload = function() {
    markers.clearLayers();
    $(".search_form input[name=query]").val("");
    $(".describe_location").fadeIn(100);
  };

  return page;
};

OSM.algoliaIntegration = (function sudoMakeMagic(){
  var searchCity = (function initAlgolia(){
    var client = new AlgoliaSearch("XS2XU0OW47", "ef286aa43862d8b04cc8030e499f4813"); // public credentials
    var index  = client.initIndex('worldCities');

    return function searchCity( query ){
      if( query === "" ) return $.Deferred().resolve( {hits: []} ).promise();
      var d = $.Deferred();
      index.search( query, function resolveIntoPromise( success, content ){
        if(success) d.resolve( content );
        else d.reject();
      } );
      return d.promise();
    };
  })();

  var success  = function success( $out, $shadowInput, results ){
    if( results.hits.length === 0) {
      $out.addClass( "hidden" );
      $shadowInput.val("");
    }
    else {
      $out.removeClass( "hidden" );
      var cityFound = results.hits[0].city;
      var query = results.query;
      if( cityFound.toLowerCase().indexOf( query.toLowerCase() ) === 0) $shadowInput.val( query[0] + cityFound.slice(1) );
      else $shadowInput.val("");
    }

    var citiesList = results.hits.reduce( function( str, hit ) {
      return str + "<li class='city'>" + hit.city + "</li>";
    }, "");

    $out.html( citiesList );
  };
  var error    = function error( $out ){
    $out.html( "Erreur" );
  };
  var createResultList = function createResultList(){
    return $( "<ul class='algolia results'></ul>" );
  };
  var getOrCreateResultList = function getOrCreateResultList( $searchField ){
    var $resultList = $searchField.parent().find( ".algolia.results" );
    if( $resultList.length === 0 ){
      var $newResultList = createResultList();
      $searchField.parent().append( $newResultList );
      return $newResultList;
    }
    else {
      return $resultList;
    }
  };

  var specialKeys = [];
  specialKeys[27] = function handleEscape( $searchInput ){ $searchInput.blur(); };

  return {
    keyupHandler: function( e, map ){
      var $searchInput = $( e.target );
      var $shadowInput  = $searchInput.siblings(".shadow-input");
      var $output       = getOrCreateResultList( $searchInput );
      if( specialKeys[e.keyCode] !== undefined ){
        var specialKeyHandler = specialKeys[e.keyCode];
        specialKeyHandler( $searchInput );
      }
      else {
        var query         = $searchInput.val();
        searchCity( query ).then( success.bind( window, $output, $shadowInput),
                                  error.bind(   window, $output, $shadowInput) );
      }
    },
    keydownHandler: function( e ){
      var $searchInput = $( e.target );
      var $shadowInput  = $searchInput.siblings(".shadow-input");
      $shadowInput.val("");
    },
    blurHandler: function( e ){
      var $searchInput = $( e.target );
      var $output       = getOrCreateResultList( $searchInput );
      var $shadowInput  = $searchInput.siblings(".shadow-input");
      $shadowInput.val("");
      $output.html("").addClass("hidden");
    }
  };
})();
