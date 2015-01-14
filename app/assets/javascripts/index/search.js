//= require jquery.simulate
//= require algoliaSearch

OSM.Search = function(map) {
  $(".search_form input[name=query]")
    .each( function( i, searchInput ){
      OSM.AlgoliaIntegration.bind( searchInput, map );
    } )
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

OSM.AlgoliaIntegration = (function sudoMakeMagic(){
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

  var render  = function render( component, nextState ){
    var $out         = component.$resultsList;
    var $searchInput = component.$searchInput;
    var $shadowInput = component.$shadowInput;
    var previousState= component.state;
    var results      = nextState.resultsList;
    var query        = nextState.userInputValue;

    if( results.length < 1 ) {
      $out.addClass( "hidden" );
      $shadowInput.val("");
    }
    else {
      $out.removeClass( "hidden" );
      var cityFound = results[0].city;
      if( cityFound.toLowerCase().indexOf( query.toLowerCase() ) === 0 &&
          nextState.selectedResult === -1) $shadowInput.val( query[0] + cityFound.slice(1) );
      else $shadowInput.val("");
    }

    if( previousState.resultsList !== nextState.resultsList ) {
      var citiesList = results.reduce( function( str, hit, i ) {
        var isSelected = (i === nextState.selectedResult);
        var className  = isSelected ? "city selected":
                                      "city";
        return str + "<li class='" + className + "'>" + hit.city + ", " + hit.country + "</li>";
      }, "");
      $out.html( citiesList );
    }

    if( previousState.selectedResult !== nextState.selectedResult) {
      $out.children().eq( previousState.selectedResult ).removeClass( "selected" );
      if( nextState.selectedResult === -1 ) $searchInput.val( nextState.userInputValue );
      else {
        $out.children().eq( nextState.selectedResult ).addClass( "selected" );
        var selectedResult = results[ nextState.selectedResult ];
        $shadowInput.val( "" );
        $searchInput.val( selectedResult.city + ", " + selectedResult.country );
      }
    }

  };

  var specialKeys = [];
  specialKeys[27] = function handleEscape( $searchInput, state ){
    $searchInput.blur();
    var nextState = new AlgoliaIntegrationState( state );
    nextState.resultsList = [];
    return nextState;
  };
  specialKeys[40] = function handleDownArrow( $searchInput, state ){
    var nextState = new AlgoliaIntegrationState( state );
    selectedResult = state.selectedResult + 1;
    if( selectedResult === state.resultsList.length )
      nextState.selectedResult = -1;
    else nextState.selectedResult = selectedResult;
    return nextState;
  };
  specialKeys[38] = function handleUpArrow( $searchInput, state ){
    var nextState = new AlgoliaIntegrationState( state );
    selectedResult = state.selectedResult - 1;
    if( selectedResult < -1 )
      nextState.selectedResult = state.resultsList.length -1;
    else nextState.selectedResult = selectedResult;
    return nextState;
  };
  //Left and right arrow shall not trigger anything
  specialKeys[37] = specialKeys[39] = function noop( $in, state ){ return state;}
  specialKeys[13] = function handleReturn( $searchInput, state, map ){
    if( state.selectedResult === -1 ) return state;

    var currentCity = state.resultsList[ state.selectedResult ];
    var center = L.latLng( currentCity._geoloc.lat, currentCity._geoloc.lng );
    map.setView( center, map.getZoom() );

    var nextState = new AlgoliaIntegrationState( state );
    nextState.userInputValue = currentCity.city + ", " + currentCity.country;
    setTimeout( function(){ $searchInput.blur() }, 0);
    return nextState;
  };

  var AlgoliaIntegrationState = function AlgoliaIntegrationState( state ){
    state = state || { userInputValue: "", selectedResult: -1, resultsList: []};
    this.userInputValue = state.userInputValue || "";
    this.selectedResult = state.selectedResult === undefined ? -1 : state.selectedResult;
    this.resultsList    = state.resultsList || [];
  };

  var AlgoliaIntegration = function AlgoliaIntegration( searchInput, map ){
    this.$searchInput = $( searchInput );
    this.$shadowInput = this.$searchInput.siblings( ".shadow-input" );

    var $resultsList = $( "<ul class='algolia results hidden'></ul>" );
    this.$searchInput.parent().append( $resultsList );
    this.$resultsList = $resultsList;

    this.state        = new AlgoliaIntegrationState( {
      userInputValue : this.$searchInput.val()
    } );
  };
  AlgoliaIntegration.bind = function createAndBindAlgolia( searchInput, map ){
    var search = new AlgoliaIntegration( searchInput );
    var $searchInput = search.$searchInput;
    var $resultsList = search.$resultsList;

    search.handleSearchSuccess.bind(search);
    search.handleSearchError.bind(search);

    $searchInput.on( "keyup",   search.keyupHandler.bind( search, map ) )
                .on( "keydown", search.keydownHandler.bind( search, map ) )
                .on( "blur",    search.blurHandler.bind( search, map ) );

    $resultsList.mouseover(  search.hoverHandler.bind( search ) )
                .mouseleave( search.leaveHandler.bind( search ) );

    return search;
  };
  AlgoliaIntegration.prototype = {
    constructor : AlgoliaIntegration,
    keyupHandler: function( map, e ){
      if( specialKeys[e.keyCode] !== undefined ){
        var specialKeyHandler = specialKeys[e.keyCode];
        var nextState = specialKeyHandler( this.$searchInput, this.state, map);
        render( this, nextState );
        this.state = nextState;

      }
      else {
        var query = this.$searchInput.val();
        var self  = this;
        searchCity( query ).then( this.handleSearchSuccess,
                                  this.handleSearchError )
                           .then( function renderAndUpdateState( nextState ) {
                             render( self, nextState );
                             self.state = nextState;
                           });
      }
    },
    handleSearchSuccess : function( results ){
      var nextState = new AlgoliaIntegrationState( this.state );
      nextState.userInputValue = results.query;
      nextState.resultsList = results.hits;
      return nextState;
    },
    handleSearchError   : function(){
      var nextState = new AlgoliaIntegrationState( this.state );
      nextState.resultsList = [];
      return nextState;
    },
    keydownHandler: function( map, e ){
      if( specialKeys[e.keyCode] ) return;
      this.$shadowInput.val("");
    },
    blurHandler: function( map, e ){
      var nextState = new AlgoliaIntegrationState( this.state );
      nextState.resultsList = [];
      nextState.selectedResult = -1;
      render( this, nextState );
      this.state = nextState;
    },
    hoverHandler: function( e ) {
      var selectedElement = e.target;
      var position = Array.prototype.indexOf.call( this.$resultsList.children(), selectedElement );

      var nextState = new AlgoliaIntegrationState( this.state );
      nextState.selectedResult = position;
      render( this, nextState );
      this.state = nextState;
    },
    leaveHandler: function( e ){
      var nextState = new AlgoliaIntegrationState( this.state );
      nextState.selectedResult = -1;
      render( this, nextState );
      this.state = nextState;
    }
  };
  return AlgoliaIntegration;
})();
