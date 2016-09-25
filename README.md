# hubot-respond

Hubot script to respond to any message with something you defined.

## Installation


1. install this npm package to your hubot repo `npm i --save hubot-alias`
2. add "hubot-alias" to your external-scripts.json

## Commands

`hubot respond to {a text} with {value}` - Creates a respond to respond_to and responds with value

`hubot delete respond to {a text}` - Deletes respond respond_to

`hubot list responds` - Lists all responds

### Example:

> you : hubot respond to hey team with @jane @jasmine @jack @joe

> hubot : Respond added

> you : hey team

> hubot : @jane @jasmine @jack @joe
