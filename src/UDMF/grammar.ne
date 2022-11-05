@{%
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
%}

@lexer lexer

udmf -> _ expr_list  {% toUDMF %}

expr_list -> global_expr:+ {% toExprList %}

global_expr -> 
    assignment {% toGobalAssign %} 
    | block {% toGlobalBlock %}

block -> identifier _ "{" _ assignment_list "}" _ {% toBlock %}

#blockname -> %blockname {% toBlockName %}

assignment_list -> assignment:+ {% toAssignmentList %}

assignment -> identifier _ "=" _ value _ ";" _  {% toAssignment %}

identifier -> %identifier {% toID %}

value ->
        number  {% toNumber %}
        | quoted_string {% toQStr %}
        | identifier {% id %}

number -> %number {% id %}

quoted_string -> %quoted_string {% id %}

_ -> null | %space {% function(d) { return null; } %}

@{% 
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



%}