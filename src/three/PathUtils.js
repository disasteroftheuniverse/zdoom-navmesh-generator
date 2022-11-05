  let { Box3, Vector3 } = require ('three');
  
  let _box = new Box3();

  function isPointInPoly (poly, pt) {
    for (var c = false, i = -1, l = poly.length, j = l - 1; ++i < l; j = i)
      ((poly[i].z <= pt.z && pt.z < poly[j].z) || (poly[j].z <= pt.z && pt.z < poly[i].z)) && (pt.x < (poly[j].x - poly[i].x) * (pt.z - poly[i].z) / (poly[j].z - poly[i].z) + poly[i].x) && (c = !c);
    return c;
  }

  function isVectorInPolygon (vector, vertices) {

    // reference point will be the centroid of the polygon
    // We need to rotate the vector as well as all the points which the polygon uses

    _box.makeEmpty();
    vertices.forEach ( vertex => {
      _box.expandByPoint( vertex );
    });

    _box.max.add( new Vector3(0, 2, 0));
    _box.min.add( new Vector3(0, -2, 0));

    //console.log(_box);

    if ( _box.containsPoint(vector) )
    {
      //return true;

       if(isPointInPoly(vertices, vector))
       {
        return true;
       }
    } 
    return false;
  }

  module.exports = { isPointInPoly, isVectorInPolygon };