// Marshal post catalog for the Nordschleife.
//
// Each entry maps a GPSoverIP `ruleid` (from /rules/active, see code60.ts) to a
// physical marshal post. The catalog is sorted by `order` — 0 is the first
// post past start/finish in race direction, monotonically increasing around
// the lap.
//
// Sourced from the same upstream as nords-gps.vercel.app
// (racingios.apioverip.de `module=geoobject` + `module=rule`, joined by
// geoObjectId == refId, filtered to the Nordschleife bbox). Stable across
// the race, so baked into the bundle rather than fetched at runtime. See
// zone-scout-report.md for the full derivation.

export interface MarshalPost {
  /** Stable id of the rule attached to this post (matches /rules/active). */
  ruleId: number;
  /** Track-side label. Mostly numeric ("1", "47"), occasionally with a letter
   *  suffix where a post is split ("2a", "200a"). */
  name: string;
  /** WGS84 latitude. */
  lat: number;
  /** WGS84 longitude. */
  lng: number;
  /** 0-based position around the lap, increasing in race direction. */
  order: number;
  /** Cumulative great-circle distance from post 1 going forward (metres). */
  cumLapM: number;
}

/** Sum of consecutive haversine distances + wrap-around (post 207 → post 1).
 *  Used to scale post positions into the LTS-reported lap length so we can
 *  bucket each post into one of the 9 sectors. */
export const MARSHAL_LAP_TOTAL_M = 25830.6;

/** Posts in race order. */
export const MARSHAL_POSTS: readonly MarshalPost[] = [
  { ruleId: 99132948, name: "1", lat: 50.335102, lng: 6.947098, order: 0, cumLapM: 0.0 },
  { ruleId: 99133162, name: "2", lat: 50.334217, lng: 6.945875, order: 1, cumLapM: 131.2 },
  { ruleId: 99133205, name: "2a", lat: 50.333611, lng: 6.944497, order: 2, cumLapM: 250.0 },
  { ruleId: 99133207, name: "3", lat: 50.332523, lng: 6.942988, order: 3, cumLapM: 411.6 },
  { ruleId: 99133234, name: "4", lat: 50.331905, lng: 6.941363, order: 4, cumLapM: 545.8 },
  { ruleId: 99133236, name: "4a", lat: 50.331146, lng: 6.941119, order: 5, cumLapM: 632.0 },
  { ruleId: 99134449, name: "5", lat: 50.332428, lng: 6.940729, order: 6, cumLapM: 777.2 },
  { ruleId: 101892494, name: "11", lat: 50.331970, lng: 6.939922, order: 7, cumLapM: 853.8 },
  { ruleId: 101892495, name: "12", lat: 50.331230, lng: 6.939912, order: 8, cumLapM: 936.1 },
  { ruleId: 99133021, name: "13", lat: 50.329857, lng: 6.938975, order: 9, cumLapM: 1102.7 },
  { ruleId: 99133041, name: "14", lat: 50.328377, lng: 6.938107, order: 10, cumLapM: 1278.4 },
  { ruleId: 99133059, name: "15", lat: 50.328132, lng: 6.939034, order: 11, cumLapM: 1349.6 },
  { ruleId: 99133075, name: "16", lat: 50.327503, lng: 6.940504, order: 12, cumLapM: 1475.2 },
  { ruleId: 101892501, name: "17", lat: 50.327038, lng: 6.940102, order: 13, cumLapM: 1534.3 },
  { ruleId: 99133121, name: "18", lat: 50.327072, lng: 6.939588, order: 14, cumLapM: 1571.0 },
  { ruleId: 99133145, name: "19", lat: 50.326794, lng: 6.938563, order: 15, cumLapM: 1650.0 },
  { ruleId: 99133164, name: "20", lat: 50.325962, lng: 6.937739, order: 16, cumLapM: 1759.5 },
  { ruleId: 99133180, name: "21", lat: 50.325886, lng: 6.936831, order: 17, cumLapM: 1824.5 },
  { ruleId: 99134453, name: "22", lat: 50.325184, lng: 6.936244, order: 18, cumLapM: 1913.0 },
  { ruleId: 99133184, name: "23", lat: 50.324558, lng: 6.935236, order: 19, cumLapM: 2012.8 },
  { ruleId: 99133186, name: "24", lat: 50.323692, lng: 6.935122, order: 20, cumLapM: 2109.4 },
  { ruleId: 99133192, name: "25", lat: 50.324993, lng: 6.934848, order: 21, cumLapM: 2255.4 },
  { ruleId: 99133194, name: "25a", lat: 50.324661, lng: 6.934741, order: 22, cumLapM: 2293.1 },
  { ruleId: 99133196, name: "26", lat: 50.325817, lng: 6.935812, order: 23, cumLapM: 2442.4 },
  { ruleId: 99133198, name: "27", lat: 50.326611, lng: 6.937288, order: 24, cumLapM: 2579.5 },
  { ruleId: 99133201, name: "28", lat: 50.326923, lng: 6.936979, order: 25, cumLapM: 2620.5 },
  { ruleId: 99133203, name: "29", lat: 50.328365, lng: 6.937336, order: 26, cumLapM: 2782.8 },
  { ruleId: 99133212, name: "30", lat: 50.328648, lng: 6.937747, order: 27, cumLapM: 2825.8 },
  { ruleId: 99133215, name: "31", lat: 50.329456, lng: 6.937950, order: 28, cumLapM: 2916.7 },
  { ruleId: 99133218, name: "32", lat: 50.329807, lng: 6.938315, order: 29, cumLapM: 2963.6 },
  { ruleId: 99133220, name: "33", lat: 50.331081, lng: 6.938683, order: 30, cumLapM: 3107.6 },
  { ruleId: 99133222, name: "34", lat: 50.331860, lng: 6.936918, order: 31, cumLapM: 3260.0 },
  { ruleId: 99133224, name: "35", lat: 50.332226, lng: 6.935920, order: 32, cumLapM: 3341.6 },
  { ruleId: 99133226, name: "36", lat: 50.333422, lng: 6.936434, order: 33, cumLapM: 3479.6 },
  { ruleId: 99133228, name: "37", lat: 50.333298, lng: 6.937261, order: 34, cumLapM: 3539.8 },
  { ruleId: 99133232, name: "39", lat: 50.334965, lng: 6.938995, order: 35, cumLapM: 3762.3 },
  { ruleId: 99133238, name: "40", lat: 50.335861, lng: 6.941178, order: 36, cumLapM: 3946.6 },
  { ruleId: 99133244, name: "41", lat: 50.336079, lng: 6.943724, order: 37, cumLapM: 4128.9 },
  { ruleId: 99133246, name: "42", lat: 50.336338, lng: 6.945684, order: 38, cumLapM: 4270.9 },
  { ruleId: 99133252, name: "43", lat: 50.337511, lng: 6.947823, order: 39, cumLapM: 4471.1 },
  { ruleId: 99133254, name: "44", lat: 50.337532, lng: 6.948112, order: 40, cumLapM: 4491.7 },
  { ruleId: 99133258, name: "45", lat: 50.337973, lng: 6.948994, order: 41, cumLapM: 4571.2 },
  { ruleId: 99133262, name: "48", lat: 50.336250, lng: 6.948888, order: 42, cumLapM: 4763.0 },
  { ruleId: 99133268, name: "61", lat: 50.338299, lng: 6.949784, order: 43, cumLapM: 4999.5 },
  { ruleId: 99133270, name: "62", lat: 50.338596, lng: 6.949200, order: 44, cumLapM: 5052.5 },
  { ruleId: 99133272, name: "63", lat: 50.339439, lng: 6.948448, order: 45, cumLapM: 5160.4 },
  { ruleId: 99133274, name: "64", lat: 50.337997, lng: 6.946681, order: 46, cumLapM: 5363.9 },
  { ruleId: 99133276, name: "65", lat: 50.337360, lng: 6.944780, order: 47, cumLapM: 5516.3 },
  { ruleId: 99133278, name: "67", lat: 50.337990, lng: 6.941756, order: 48, cumLapM: 5742.1 },
  { ruleId: 99133280, name: "68", lat: 50.338085, lng: 6.939652, order: 49, cumLapM: 5891.8 },
  { ruleId: 99133286, name: "70", lat: 50.338253, lng: 6.938349, order: 50, cumLapM: 5986.1 },
  { ruleId: 101892721, name: "71", lat: 50.339314, lng: 6.936894, order: 51, cumLapM: 6142.9 },
  { ruleId: 99133290, name: "73", lat: 50.340099, lng: 6.935897, order: 52, cumLapM: 6255.3 },
  { ruleId: 99133292, name: "74", lat: 50.340309, lng: 6.934101, order: 53, cumLapM: 6384.8 },
  { ruleId: 99133296, name: "75", lat: 50.340862, lng: 6.933729, order: 54, cumLapM: 6451.8 },
  { ruleId: 99133298, name: "76", lat: 50.342587, lng: 6.930249, order: 55, cumLapM: 6764.5 },
  { ruleId: 99133300, name: "77", lat: 50.343372, lng: 6.928725, order: 56, cumLapM: 6903.4 },
  { ruleId: 99133304, name: "79", lat: 50.344773, lng: 6.926663, order: 57, cumLapM: 7117.2 },
  { ruleId: 99133310, name: "80", lat: 50.346405, lng: 6.925614, order: 58, cumLapM: 7313.3 },
  { ruleId: 99133312, name: "81", lat: 50.347870, lng: 6.926609, order: 59, cumLapM: 7490.9 },
  { ruleId: 99133314, name: "82", lat: 50.350368, lng: 6.926967, order: 60, cumLapM: 7769.8 },
  { ruleId: 99133316, name: "85", lat: 50.354160, lng: 6.925081, order: 61, cumLapM: 8212.2 },
  { ruleId: 99133320, name: "86", lat: 50.355988, lng: 6.924044, order: 62, cumLapM: 8428.3 },
  { ruleId: 99133326, name: "88", lat: 50.357479, lng: 6.920791, order: 63, cumLapM: 8712.5 },
  { ruleId: 99133333, name: "90", lat: 50.358222, lng: 6.919942, order: 64, cumLapM: 8814.7 },
  { ruleId: 99135920, name: "93", lat: 50.359093, lng: 6.923189, order: 65, cumLapM: 9064.6 },
  { ruleId: 99133339, name: "94", lat: 50.360184, lng: 6.925542, order: 66, cumLapM: 9270.9 },
  { ruleId: 99133341, name: "95", lat: 50.361473, lng: 6.927405, order: 67, cumLapM: 9465.9 },
  { ruleId: 99133343, name: "96", lat: 50.362526, lng: 6.929239, order: 68, cumLapM: 9640.9 },
  { ruleId: 101892728, name: "97", lat: 50.363594, lng: 6.929856, order: 69, cumLapM: 9767.5 },
  { ruleId: 99133345, name: "98", lat: 50.364151, lng: 6.930226, order: 70, cumLapM: 9834.8 },
  { ruleId: 99133347, name: "99", lat: 50.366135, lng: 6.931282, order: 71, cumLapM: 10067.7 },
  { ruleId: 99132954, name: "100", lat: 50.366760, lng: 6.931223, order: 72, cumLapM: 10137.4 },
  { ruleId: 99132956, name: "100a", lat: 50.368004, lng: 6.933043, order: 73, cumLapM: 10326.6 },
  { ruleId: 99132958, name: "101", lat: 50.369698, lng: 6.935721, order: 74, cumLapM: 10594.1 },
  { ruleId: 99132960, name: "103", lat: 50.371010, lng: 6.937475, order: 75, cumLapM: 10785.8 },
  { ruleId: 101892729, name: "103a", lat: 50.372173, lng: 6.937576, order: 76, cumLapM: 10915.3 },
  { ruleId: 99132962, name: "104", lat: 50.373390, lng: 6.936981, order: 77, cumLapM: 11057.1 },
  { ruleId: 99132964, name: "105", lat: 50.373405, lng: 6.935527, order: 78, cumLapM: 11160.2 },
  { ruleId: 99132966, name: "106", lat: 50.373665, lng: 6.934908, order: 79, cumLapM: 11212.8 },
  { ruleId: 99132968, name: "107", lat: 50.374241, lng: 6.933558, order: 80, cumLapM: 11327.9 },
  { ruleId: 99132970, name: "108", lat: 50.374722, lng: 6.933858, order: 81, cumLapM: 11385.5 },
  { ruleId: 101892732, name: "108a", lat: 50.375549, lng: 6.935969, order: 82, cumLapM: 11561.2 },
  { ruleId: 99132972, name: "110", lat: 50.376648, lng: 6.936928, order: 83, cumLapM: 11701.0 },
  { ruleId: 99132974, name: "111", lat: 50.377552, lng: 6.937900, order: 84, cumLapM: 11822.9 },
  { ruleId: 99132976, name: "112", lat: 50.377697, lng: 6.939852, order: 85, cumLapM: 11962.3 },
  { ruleId: 99132978, name: "112a", lat: 50.377373, lng: 6.940643, order: 86, cumLapM: 12028.9 },
  { ruleId: 99132980, name: "113", lat: 50.376736, lng: 6.942151, order: 87, cumLapM: 12157.2 },
  { ruleId: 99132982, name: "114", lat: 50.376186, lng: 6.942554, order: 88, cumLapM: 12224.7 },
  { ruleId: 99132984, name: "115", lat: 50.376755, lng: 6.943640, order: 89, cumLapM: 12324.4 },
  { ruleId: 99132986, name: "116", lat: 50.376827, lng: 6.947425, order: 90, cumLapM: 12592.9 },
  { ruleId: 99132988, name: "118", lat: 50.376602, lng: 6.949624, order: 91, cumLapM: 12750.8 },
  { ruleId: 99132994, name: "120", lat: 50.377922, lng: 6.950497, order: 92, cumLapM: 12910.1 },
  { ruleId: 99132996, name: "121", lat: 50.378357, lng: 6.950676, order: 93, cumLapM: 12960.1 },
  { ruleId: 99132998, name: "122", lat: 50.378899, lng: 6.952391, order: 94, cumLapM: 13095.9 },
  { ruleId: 99133000, name: "123", lat: 50.379337, lng: 6.954926, order: 95, cumLapM: 13282.1 },
  { ruleId: 99133007, name: "124", lat: 50.379707, lng: 6.957656, order: 96, cumLapM: 13480.0 },
  { ruleId: 99133009, name: "125", lat: 50.380798, lng: 6.959785, order: 97, cumLapM: 13673.7 },
  { ruleId: 99133011, name: "125a", lat: 50.380816, lng: 6.960969, order: 98, cumLapM: 13757.7 },
  { ruleId: 99133013, name: "126", lat: 50.380024, lng: 6.961394, order: 99, cumLapM: 13850.7 },
  { ruleId: 99133015, name: "127", lat: 50.376797, lng: 6.961608, order: 100, cumLapM: 14209.9 },
  { ruleId: 99133017, name: "128", lat: 50.375065, lng: 6.964264, order: 101, cumLapM: 14479.3 },
  { ruleId: 99133019, name: "129", lat: 50.374458, lng: 6.966867, order: 102, cumLapM: 14675.8 },
  { ruleId: 99133023, name: "130", lat: 50.374687, lng: 6.969308, order: 103, cumLapM: 14850.8 },
  { ruleId: 99133025, name: "131", lat: 50.374158, lng: 6.972869, order: 104, cumLapM: 15110.1 },
  { ruleId: 99133027, name: "132", lat: 50.372955, lng: 6.977289, order: 105, cumLapM: 15450.9 },
  { ruleId: 99133029, name: "133", lat: 50.372173, lng: 6.979351, order: 106, cumLapM: 15621.0 },
  { ruleId: 99133031, name: "134", lat: 50.372295, lng: 6.980415, order: 107, cumLapM: 15697.7 },
  { ruleId: 99133033, name: "136", lat: 50.373070, lng: 6.982713, order: 108, cumLapM: 15882.0 },
  { ruleId: 99133035, name: "137", lat: 50.373871, lng: 6.984072, order: 109, cumLapM: 16013.3 },
  { ruleId: 99133037, name: "138", lat: 50.374413, lng: 6.985830, order: 110, cumLapM: 16151.7 },
  { ruleId: 99133039, name: "139", lat: 50.374634, lng: 6.989397, order: 111, cumLapM: 16405.9 },
  { ruleId: 99133043, name: "141", lat: 50.373020, lng: 6.987672, order: 112, cumLapM: 16623.1 },
  { ruleId: 99133045, name: "142", lat: 50.372349, lng: 6.986276, order: 113, cumLapM: 16747.1 },
  { ruleId: 101892733, name: "143", lat: 50.371998, lng: 6.985520, order: 114, cumLapM: 16813.4 },
  { ruleId: 99133047, name: "144", lat: 50.372452, lng: 6.987021, order: 115, cumLapM: 16931.2 },
  { ruleId: 99133049, name: "145", lat: 50.373058, lng: 6.988969, order: 116, cumLapM: 17084.9 },
  { ruleId: 99133051, name: "146", lat: 50.373421, lng: 6.991788, order: 117, cumLapM: 17288.9 },
  { ruleId: 99133053, name: "147", lat: 50.374264, lng: 6.993192, order: 118, cumLapM: 17425.6 },
  { ruleId: 99133055, name: "148", lat: 50.374931, lng: 6.994134, order: 119, cumLapM: 17525.4 },
  { ruleId: 99133057, name: "149", lat: 50.376011, lng: 6.993987, order: 120, cumLapM: 17646.0 },
  { ruleId: 99133061, name: "152", lat: 50.376911, lng: 6.995061, order: 121, cumLapM: 17771.7 },
  { ruleId: 99133063, name: "153", lat: 50.376610, lng: 6.996796, order: 122, cumLapM: 17899.2 },
  { ruleId: 99133065, name: "154", lat: 50.376457, lng: 6.998990, order: 123, cumLapM: 18055.7 },
  { ruleId: 99133067, name: "155", lat: 50.375538, lng: 6.999802, order: 124, cumLapM: 18173.0 },
  { ruleId: 99133069, name: "157", lat: 50.375088, lng: 7.001751, order: 125, cumLapM: 18320.0 },
  { ruleId: 99133071, name: "158", lat: 50.374310, lng: 7.003085, order: 126, cumLapM: 18448.2 },
  { ruleId: 99133073, name: "159", lat: 50.373405, lng: 7.003681, order: 127, cumLapM: 18557.4 },
  { ruleId: 99133077, name: "160", lat: 50.371609, lng: 7.002722, order: 128, cumLapM: 18768.3 },
  { ruleId: 99133079, name: "161", lat: 50.371162, lng: 7.003419, order: 129, cumLapM: 18838.4 },
  { ruleId: 99133083, name: "162", lat: 50.370708, lng: 7.005274, order: 130, cumLapM: 18979.4 },
  { ruleId: 101892738, name: "163", lat: 50.369831, lng: 7.005328, order: 131, cumLapM: 19076.9 },
  { ruleId: 99133085, name: "164", lat: 50.368706, lng: 7.004882, order: 132, cumLapM: 19206.0 },
  { ruleId: 99133087, name: "165", lat: 50.368706, lng: 7.001715, order: 133, cumLapM: 19430.6 },
  { ruleId: 99133089, name: "166", lat: 50.368607, lng: 7.001432, order: 134, cumLapM: 19453.5 },
  { ruleId: 99133091, name: "167", lat: 50.367821, lng: 7.000813, order: 135, cumLapM: 19551.3 },
  { ruleId: 99133093, name: "168", lat: 50.367163, lng: 7.000139, order: 136, cumLapM: 19638.7 },
  { ruleId: 99133095, name: "169", lat: 50.366585, lng: 6.999589, order: 137, cumLapM: 19713.9 },
  { ruleId: 99133101, name: "170", lat: 50.363754, lng: 6.999943, order: 138, cumLapM: 20029.7 },
  { ruleId: 99133103, name: "172", lat: 50.363140, lng: 6.998123, order: 139, cumLapM: 20175.7 },
  { ruleId: 99133105, name: "173", lat: 50.362766, lng: 6.997455, order: 140, cumLapM: 20238.8 },
  { ruleId: 99133107, name: "174", lat: 50.361740, lng: 6.995584, order: 141, cumLapM: 20413.8 },
  { ruleId: 99133109, name: "175", lat: 50.361553, lng: 6.995379, order: 142, cumLapM: 20439.1 },
  { ruleId: 99133111, name: "176", lat: 50.360661, lng: 6.994612, order: 143, cumLapM: 20552.3 },
  { ruleId: 99133113, name: "177", lat: 50.359547, lng: 6.993208, order: 144, cumLapM: 20711.2 },
  { ruleId: 99133115, name: "178", lat: 50.358898, lng: 6.991240, order: 145, cumLapM: 20868.4 },
  { ruleId: 99133117, name: "178a", lat: 50.358715, lng: 6.989900, order: 146, cumLapM: 20965.6 },
  { ruleId: 99133119, name: "179", lat: 50.358463, lng: 6.987505, order: 147, cumLapM: 21137.8 },
  { ruleId: 99133123, name: "180", lat: 50.358631, lng: 6.984623, order: 148, cumLapM: 21343.1 },
  { ruleId: 99133125, name: "180a", lat: 50.359116, lng: 6.983700, order: 149, cumLapM: 21427.9 },
  { ruleId: 99133127, name: "181", lat: 50.358864, lng: 6.983314, order: 150, cumLapM: 21467.1 },
  { ruleId: 99133129, name: "182", lat: 50.357677, lng: 6.980951, order: 151, cumLapM: 21680.4 },
  { ruleId: 99133131, name: "183", lat: 50.357026, lng: 6.981997, order: 152, cumLapM: 21784.1 },
  { ruleId: 99133133, name: "184", lat: 50.356770, lng: 6.982379, order: 153, cumLapM: 21823.4 },
  { ruleId: 99133135, name: "185", lat: 50.356159, lng: 6.985180, order: 154, cumLapM: 22033.4 },
  { ruleId: 99133137, name: "186", lat: 50.354919, lng: 6.986324, order: 155, cumLapM: 22193.4 },
  { ruleId: 99133139, name: "187", lat: 50.353745, lng: 6.986083, order: 156, cumLapM: 22325.1 },
  { ruleId: 99133141, name: "188", lat: 50.352940, lng: 6.983456, order: 157, cumLapM: 22531.8 },
  { ruleId: 99133143, name: "189", lat: 50.352448, lng: 6.982764, order: 158, cumLapM: 22605.3 },
  { ruleId: 99133149, name: "191", lat: 50.350288, lng: 6.977283, order: 159, cumLapM: 23062.4 },
  { ruleId: 99133151, name: "193", lat: 50.348442, lng: 6.972472, order: 160, cumLapM: 23460.7 },
  { ruleId: 99133153, name: "194", lat: 50.348152, lng: 6.971762, order: 161, cumLapM: 23520.6 },
  { ruleId: 99133155, name: "195", lat: 50.346462, lng: 6.967475, order: 162, cumLapM: 23878.1 },
  { ruleId: 99133157, name: "197", lat: 50.345730, lng: 6.965426, order: 163, cumLapM: 24044.7 },
  { ruleId: 99725553, name: "198", lat: 50.344738, lng: 6.963336, order: 164, cumLapM: 24229.6 },
  { ruleId: 99133166, name: "200", lat: 50.343559, lng: 6.959944, order: 165, cumLapM: 24503.7 },
  { ruleId: 99133168, name: "200a", lat: 50.341980, lng: 6.957530, order: 166, cumLapM: 24749.0 },
  { ruleId: 99133170, name: "201", lat: 50.339827, lng: 6.955122, order: 167, cumLapM: 25043.1 },
  { ruleId: 99135733, name: "202", lat: 50.338821, lng: 6.953934, order: 168, cumLapM: 25183.2 },
  { ruleId: 101892743, name: "205", lat: 50.338066, lng: 6.952785, order: 169, cumLapM: 25300.2 },
  { ruleId: 99133178, name: "207", lat: 50.337738, lng: 6.951258, order: 170, cumLapM: 25414.6 },
];

const BY_RULE_ID: ReadonlyMap<number, MarshalPost> = new Map(
  MARSHAL_POSTS.map((p) => [p.ruleId, p] as const),
);

export function getMarshalPost(ruleId: number): MarshalPost | undefined {
  return BY_RULE_ID.get(ruleId);
}
