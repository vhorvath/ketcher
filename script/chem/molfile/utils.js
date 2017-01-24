var Vec2 = require('../../util/vec2');
var Struct = require('./../struct/index');

function paddedNum(number, width, precision) {
	var numStr = number.toFixed(precision || 0).replace(',', '.'); // Really need to replace?
	if (numStr.length > width)
		throw new Error('number does not fit');
	return numStr.padStart(width);
}

function parseDecimalInt(str) {
	/* reader */
	var val = parseInt(str, 10);

	return isNaN(val) ? 0 : val;
}

function partitionLine(/* string*/ str, /* array of int*/ parts, /* bool*/ withspace) {
	/* reader */
	var res = [];
	for (var i = 0, shift = 0; i < parts.length; ++i) {
		res.push(str.slice(shift, shift + parts[i]));
		if (withspace)
			shift++;
		shift += parts[i];
	}
	return res;
}

function partitionLineFixed(/* string*/ str, /* int*/ itemLength, /* bool*/ withspace) {
	/* reader */
	var res = [];
	for (var shift = 0; shift < str.length; shift += itemLength) {
		res.push(str.slice(shift, shift + itemLength));
		if (withspace)
			shift++;
	}
	return res;
}

var fmtInfo = {
	bondTypeMap: {
		1: Struct.Bond.PATTERN.TYPE.SINGLE,
		2: Struct.Bond.PATTERN.TYPE.DOUBLE,
		3: Struct.Bond.PATTERN.TYPE.TRIPLE,
		4: Struct.Bond.PATTERN.TYPE.AROMATIC,
		5: Struct.Bond.PATTERN.TYPE.SINGLE_OR_DOUBLE,
		6: Struct.Bond.PATTERN.TYPE.SINGLE_OR_AROMATIC,
		7: Struct.Bond.PATTERN.TYPE.DOUBLE_OR_AROMATIC,
		8: Struct.Bond.PATTERN.TYPE.ANY
	},
	bondStereoMap: {
		0: Struct.Bond.PATTERN.STEREO.NONE,
		1: Struct.Bond.PATTERN.STEREO.UP,
		4: Struct.Bond.PATTERN.STEREO.EITHER,
		6: Struct.Bond.PATTERN.STEREO.DOWN,
		3: Struct.Bond.PATTERN.STEREO.CIS_TRANS
	},
	v30bondStereoMap: {
		0: Struct.Bond.PATTERN.STEREO.NONE,
		1: Struct.Bond.PATTERN.STEREO.UP,
		2: Struct.Bond.PATTERN.STEREO.EITHER,
		3: Struct.Bond.PATTERN.STEREO.DOWN
	},
	bondTopologyMap: {
		0: Struct.Bond.PATTERN.TOPOLOGY.EITHER,
		1: Struct.Bond.PATTERN.TOPOLOGY.RING,
		2: Struct.Bond.PATTERN.TOPOLOGY.CHAIN
	},
	countsLinePartition: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 6],
	atomLinePartition: [10, 10, 10, 1, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
	bondLinePartition: [3, 3, 3, 3, 3, 3, 3],
	atomListHeaderPartition: [3, 1, 1, 4, 1, 1],
	atomListHeaderLength: 11, // = atomListHeaderPartition.reduce(function(a,b) { return a + b; }, 0)
	atomListHeaderItemLength: 4,
	chargeMap: [0, +3, +2, +1, 0, -1, -2, -3],
	valenceMap: [undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0],
	implicitHydrogenMap: [undefined, 0, 1, 2, 3, 4],
	v30atomPropMap: {
		CHG: 'charge',
		RAD: 'radical',
		MASS: 'isotope',
		VAL: 'explicitValence',
		HCOUNT: 'hCount',
		INVRET: 'invRet',
		SUBST: 'substitutionCount',
		UNSAT: 'unsaturatedAtom',
		RBCNT: 'ringBondCount'
	},
	rxnItemsPartition: [3, 3, 3]
};

var FRAGMENT = {
	NONE: 0,
	REACTANT: 1,
	PRODUCT: 2,
	AGENT: 3
};

function rxnMerge(mols, nReactants, nProducts) /* Struct */ { // eslint-disable-line max-statements
	/* reader */
	var ret = new Struct();
	var bbReact = [],
		bbAgent = [],
		bbProd = [];
	var molReact = [],
		molAgent = [],
		molProd = [];
	var j;
	var bondLengthData = { cnt: 0, totalLength: 0 };
	for (j = 0; j < mols.length; ++j) {
		var mol = mols[j];
		var bondLengthDataMol = mol.getBondLengthData();
		bondLengthData.cnt += bondLengthDataMol.cnt;
		bondLengthData.totalLength += bondLengthDataMol.totalLength;
	}
	var avgBondLength = 1 / (bondLengthData.cnt == 0 ? 1 : bondLengthData.totalLength / bondLengthData.cnt);
	for (j = 0; j < mols.length; ++j) {
		mol = mols[j];
		mol.scale(avgBondLength);
	}

	for (j = 0; j < mols.length; ++j) {
		mol = mols[j];
		var bb = mol.getCoordBoundingBoxObj();
		if (!bb)
			continue; // eslint-disable-line no-continue

		var fragmentType = (j < nReactants ? FRAGMENT.REACTANT : // eslint-disable-line no-nested-ternary
			(j < nReactants + nProducts ? FRAGMENT.PRODUCT :
				FRAGMENT.AGENT));
		if (fragmentType == FRAGMENT.REACTANT) {
			bbReact.push(bb);
			molReact.push(mol);
		} else if (fragmentType == FRAGMENT.AGENT) {
			bbAgent.push(bb);
			molAgent.push(mol);
		} else if (fragmentType == FRAGMENT.PRODUCT) {
			bbProd.push(bb);
			molProd.push(mol);
		}

		mol.atoms.each(function (aid, atom) {
			atom.rxnFragmentType = fragmentType;
		});
	}

	// reaction fragment layout
	var xorig = 0;
	function shiftMol(ret, mol, bb, xorig, over) { // eslint-disable-line max-params
		var d = new Vec2(xorig - bb.min.x, over ? 1 - bb.min.y : -(bb.min.y + bb.max.y) / 2);
		mol.atoms.each(function (aid, atom) {
			atom.pp.add_(d); // eslint-disable-line no-underscore-dangle
		});
		mol.sgroups.each(function (id, item) {
			if (item.pp)
				item.pp.add_(d); // eslint-disable-line no-underscore-dangle
		});
		bb.min.add_(d); // eslint-disable-line no-underscore-dangle
		bb.max.add_(d); // eslint-disable-line no-underscore-dangle
		mol.mergeInto(ret);
		return bb.max.x - bb.min.x;
	}

	for (j = 0; j < molReact.length; ++j)
		xorig += shiftMol(ret, molReact[j], bbReact[j], xorig, false) + 2.0;
	xorig += 2.0;
	for (j = 0; j < molAgent.length; ++j)
		xorig += shiftMol(ret, molAgent[j], bbAgent[j], xorig, true) + 2.0;
	xorig += 2.0;

	for (j = 0; j < molProd.length; ++j)
		xorig += shiftMol(ret, molProd[j], bbProd[j], xorig, false) + 2.0;

	var bb1;
	var bb2;
	var x;
	var y;
	var bbReactAll = null;
	var bbProdAll = null;
	for (j = 0; j <	bbReact.length - 1; ++j) {
		bb1 = bbReact[j];
		bb2 = bbReact[j + 1];

		x = (bb1.max.x + bb2.min.x) / 2;
		y = (bb1.max.y + bb1.min.y + bb2.max.y + bb2.min.y) / 4;

		ret.rxnPluses.add(new Struct.RxnPlus({ pp: new Vec2(x, y) }));
	}
	for (j = 0; j <	bbReact.length; ++j) {
		if (j == 0) {
			bbReactAll = {};
			bbReactAll.max = new Vec2(bbReact[j].max);
			bbReactAll.min = new Vec2(bbReact[j].min);
		} else {
			bbReactAll.max = Vec2.max(bbReactAll.max, bbReact[j].max);
			bbReactAll.min = Vec2.min(bbReactAll.min, bbReact[j].min);
		}
	}
	for (j = 0; j <	bbProd.length - 1; ++j) {
		bb1 = bbProd[j];
		bb2 = bbProd[j + 1];

		x = (bb1.max.x + bb2.min.x) / 2;
		y = (bb1.max.y + bb1.min.y + bb2.max.y + bb2.min.y) / 4;

		ret.rxnPluses.add(new Struct.RxnPlus({ pp: new Vec2(x, y) }));
	}
	for (j = 0; j <	bbProd.length; ++j) {
		if (j == 0) {
			bbProdAll = {};
			bbProdAll.max = new Vec2(bbProd[j].max);
			bbProdAll.min = new Vec2(bbProd[j].min);
		} else {
			bbProdAll.max = Vec2.max(bbProdAll.max, bbProd[j].max);
			bbProdAll.min = Vec2.min(bbProdAll.min, bbProd[j].min);
		}
	}
	bb1 = bbReactAll;
	bb2 = bbProdAll;
	if (!bb1 && !bb2) {
		ret.rxnArrows.add(new Struct.RxnArrow({ pp: new Vec2(0, 0) }));
	} else {
		var v1 = bb1 ? new Vec2(bb1.max.x, (bb1.max.y + bb1.min.y) / 2) : null;
		var v2 = bb2 ? new Vec2(bb2.min.x, (bb2.max.y + bb2.min.y) / 2) : null;
		var defaultOffset = 3;
		if (!v1)
			v1 = new Vec2(v2.x - defaultOffset, v2.y);
		if (!v2)
			v2 = new Vec2(v1.x + defaultOffset, v1.y);
		ret.rxnArrows.add(new Struct.RxnArrow({ pp: Vec2.lc2(v1, 0.5, v2, 0.5) }));
	}
	ret.isReaction = true;
	return ret;
}

module.exports = {
	fmtInfo: fmtInfo,
	paddedNum: paddedNum,
	parseDecimalInt: parseDecimalInt,
	partitionLine: partitionLine,
	partitionLineFixed: partitionLineFixed,
	rxnMerge: rxnMerge
};