Runtime Error



unknown type: dblclick
src/components/tree/TreeCanvas.js (76:8) @ TreeCanvas.TreeCanvas.useEffect


  74 |         }
  75 |       });
> 76 |     zb.on('dblclick.zoom', null); // el doble clic abre el popup, no zoom
     |        ^
  77 |     zoomRef.current = zb;
  78 |     select(container).call(zb);
  79 |     const ro = new ResizeObserver(() => {