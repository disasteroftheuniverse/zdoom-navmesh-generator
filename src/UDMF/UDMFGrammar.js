// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

const moo = require('moo');
let lexer = moo.compile({
    /* identify whitespace and ignore it*/
    space: {match: /\s+/, lineBreaks: true},
    /* identifiers are strings that tell things what to do */
    identifier: /[A-Za-z_]+[A-Za-z0-9_]*/,
    /* identify specific blocks */
    blockname: ['thing','vertex','linedef','sidedef','sector'],
    /* identify numbers */
    number: /[+-]?[0-9]+\.?[0-9]*/, //i can't believe this fucking actually works
    /* identify text udmf fields*/
    quoted_string: /"(?:[^"\\]*(?:\\.[^"\\]*)*)"/,
    /* identify text udmf fields*/
    '{': '{',
    '}': '}',
    '[': '[',
    ']': ']',
    ',': ',',
    ':': ':',
    ';' : ';',
    '=' : '=',
    '.' : '.'
});

 
    function printDebug(msg)
    {
        console.log('------------');
        console.log(msg);
        console.log('------------');
    }

    function toBlockName(d)
    {
        console.log(d);
        return d[0];
    }

    function toUDMF(d)
    {
        return d[1];
    }

    function toExprList(d)
    {
        return d[0];
    }

    function toGobalAssign(d)
    {
        return d[0];
    }

    function toGlobalBlock(d)
    {
        return d[0];
    }

    var lastType = null;

    function toBlock(d)
    {
        let assignments = d[4];
        let obj = {};

        if (assignments.length)
        {
            for (var i = 0; i< assignments.length; i++)
            {
                var pair = assignments[i];
                if (pair) obj[pair[0]] = pair[1];
            }
        }

        let type = d[0];
        obj['blocktype'] = type;
        return obj;
    }

    function toBlockList(d) 
    {
        var block = d[0];
        return block;
    }

    function toAssignmentList(d) 
    {
        return d[0];
    }

    function toAssignment(d) 
    {
        let key = d[0];
        let val = d[4];
        let pair = [key, val];
        //console.log(pair);
        return pair;
    }

    function toID(d) 
    {
        return d[0].value;
    }

    function toNumber(d) 
    {
        return Number(d[0]);
    }

    function toValue(d) {
        //printDebug(d);
        return d[0].value;
    }

    function toQStr(d) {
        return d[0].value.replace(/\"/gm, '');
    }



var grammar = {
    Lexer: lexer,
    ParserRules: [
    {"name": "udmf", "symbols": ["_", "expr_list"], "postprocess": toUDMF},
    {"name": "expr_list$ebnf$1", "symbols": ["global_expr"]},
    {"name": "expr_list$ebnf$1", "symbols": ["expr_list$ebnf$1", "global_expr"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "expr_list", "symbols": ["expr_list$ebnf$1"], "postprocess": toExprList},
    {"name": "global_expr", "symbols": ["assignment"], "postprocess": toGobalAssign},
    {"name": "global_expr", "symbols": ["block"], "postprocess": toGlobalBlock},
    {"name": "block", "symbols": ["identifier", "_", {"literal":"{"}, "_", "assignment_list", {"literal":"}"}, "_"], "postprocess": toBlock},
    {"name": "assignment_list$ebnf$1", "symbols": ["assignment"]},
    {"name": "assignment_list$ebnf$1", "symbols": ["assignment_list$ebnf$1", "assignment"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "assignment_list", "symbols": ["assignment_list$ebnf$1"], "postprocess": toAssignmentList},
    {"name": "assignment", "symbols": ["identifier", "_", {"literal":"="}, "_", "value", "_", {"literal":";"}, "_"], "postprocess": toAssignment},
    {"name": "identifier", "symbols": [(lexer.has("identifier") ? {type: "identifier"} : identifier)], "postprocess": toID},
    {"name": "value", "symbols": ["number"], "postprocess": toNumber},
    {"name": "value", "symbols": ["quoted_string"], "postprocess": toQStr},
    {"name": "value", "symbols": ["identifier"], "postprocess": id},
    {"name": "number", "symbols": [(lexer.has("number") ? {type: "number"} : number)], "postprocess": id},
    {"name": "quoted_string", "symbols": [(lexer.has("quoted_string") ? {type: "quoted_string"} : quoted_string)], "postprocess": id},
    {"name": "_", "symbols": []},
    {"name": "_", "symbols": [(lexer.has("space") ? {type: "space"} : space)], "postprocess": function(d) { return null; }}
]
  , ParserStart: "udmf"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
