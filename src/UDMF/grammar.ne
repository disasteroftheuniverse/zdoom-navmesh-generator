@{%
const moo = require('moo');

// Define a lexer using Moo for tokenizing UDMF text
let lexer = moo.compile({
    /* Whitespace (spaces, tabs, newlines), ignored in parsing */
    space: { match: /\s+/, lineBreaks: true },

    /* Identifiers: strings that represent property names or labels */
    identifier: /[A-Za-z_]+[A-Za-z0-9_]*/,

    /* Specific block types in UDMF */
    blockname: ['thing','vertex','linedef','sidedef','sector'],

    /* Numbers: integers or floats, optionally signed */
    number: /[+-]?[0-9]+\.?[0-9]*/, // surprisingly works for UDMF numbers

    /* Quoted strings: used for UDMF text fields */
    quoted_string: /"(?:[^"\\]*(?:\\.[^"\\]*)*)"/,

    /* Punctuation and delimiters in UDMF syntax */
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

// Assign lexer to grammar
@lexer lexer

// Top-level rule: UDMF consists of optional whitespace, followed by a list of expressions
udmf -> _ expr_list  {% toUDMF %}

// expr_list: one or more global expressions
expr_list -> global_expr:+ {% toExprList %}

// Global expression: either an assignment or a block
global_expr -> 
    assignment {% toGobalAssign %} 
    | block {% toGlobalBlock %}

// Block structure: identifier, opening brace, list of assignments, closing brace
block -> identifier _ "{" _ assignment_list "}" _ {% toBlock %}

// #blockname -> %blockname {% toBlockName %}  // commented out: could be used for stricter block types

// List of assignments within a block
assignment_list -> assignment:+ {% toAssignmentList %}

// Single assignment: key = value;
assignment -> identifier _ "=" _ value _ ";" _  {% toAssignment %}

// Identifier rule: returns the token value
identifier -> %identifier {% toID %}

// Values can be number, quoted string, or identifier
value ->
        number  {% toNumber %}
        | quoted_string {% toQStr %}
        | identifier {% id %}

// Number and quoted string rules return token values
number -> %number {% id %}
quoted_string -> %quoted_string {% id %}

// Optional whitespace rule
_ -> null | %space {% function(d) { return null; } %}

@{% 
// Helper functions for building the AST

// Debug print utility
function printDebug(msg)
{
    console.log('------------');
    console.log(msg);
    console.log('------------');
}

// Return the block name token (not used currently)
function toBlockName(d)
{
    console.log(d);
    return d[0];
}

// Top-level UDMF function: returns the list of expressions
function toUDMF(d)
{
    return d[1];
}

// Convert expr_list to array
function toExprList(d)
{
    return d[0];
}

// Assignment directly from parsing
function toGobalAssign(d)
{
    return d[0];
}

// Block returned directly
function toGlobalBlock(d)
{
    return d[0];
}

// Track last block type
var lastType = null;

// Convert a block into an object with a blocktype and assignments
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
    obj['blocktype'] = type; // store type of block (thing, vertex, etc.)
    return obj;
}

// Helper to convert single block to list (currently simple passthrough)
function toBlockList(d) 
{
    var block = d[0];
    return block;
}

// Convert list of assignments to array
function toAssignmentList(d) 
{
    return d[0];
}

// Convert single assignment into [key, value] pair
function toAssignment(d) 
{
    let key = d[0];
    let val = d[4];
    let pair = [key, val];
    //console.log(pair);
    return pair;
}

// Convert identifier token to string value
function toID(d) 
{
    return d[0].value;
}

// Convert number token to numeric type
function toNumber(d) 
{
    return Number(d[0]);
}

// Convert value token to its raw value
function toValue(d) {
    //printDebug(d);
    return d[0].value;
}

// Convert quoted string token to string without quotes
function toQStr(d) {
    return d[0].value.replace(/\"/gm, '');
}
%}
