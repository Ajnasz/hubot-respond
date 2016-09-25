# hubot-respond

Hubot script to respond to any message with something you defined.

## Installation


1. install this npm package to your hubot repo `npm i --save hubot-respond`
2. add "hubot-respond" to your external-scripts.json

## Commands

`hubot respond to {a text} with {value}` - Creates a new respond

`hubot delete respond to {a text}` - Deletes a respond

`hubot list responds` - Lists all responds

### Example:

> you : hubot respond to hey team with @jane @jasmine @jack @joe

> hubot : Respond added

> you : hey team

> hubot : @jane @jasmine @jack @joe
