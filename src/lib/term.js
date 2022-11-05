const figlet = require('figlet');
const chalk = require('chalk');

class Terminal
{
    constructor()
    {
        this.chalk = chalk;
        this.msg = '';
        this.hasMsg = false;
    }

    DopeAssTitle()
    {
        let msg = 'UDMFTOOLS';

        let fig = figlet.textSync(msg, {
            font: 'Slant',
            whitespaceBreak: true
        });

        let coloredMsg = chalk.yellow(fig);
        this.div();
        console.log(coloredMsg);
        console.log(chalk.yellow('(C) 20XX MetaComputer Technology Corporation\n'));
        this.div();
    }

    clearMsg()
    {
        this.hasMsg = false;
        this.msg = '';
    }

    div()
    {
        console.log(chalk.yellow('-------------------------------'));
    }

    white(msg)
    {
        msg = chalk.whiteBright(msg);

        if (this.hasMsg)
        {
            this.msg = this.msg + msg;
            return this;
        }
        
        this.clearMsg();
        console.log(msg);
    }

    red(msg)
    {
        msg = chalk.redBright(msg);

        if (this.hasMsg)
        {
            this.msg = this.msg + msg;
            return this;
        }
        
        this.clearMsg();
        console.log(msg);
    }

    yellow(msg)
    {
        msg = chalk.yellowBright(msg);

        if (this.hasMsg)
        {
            this.msg = this.msg + msg;
            return this;
        }
        
        this.clearMsg();
        console.log(msg);
    }

    say(msg)
    {
        if (msg) 
        {
            this.hasMsg = false;
            console.log( chalk.yellow(msg) );
            return;
        }

        this.hasMsg = true;
        this.msg = '';
        return this;
    }

    print()
    {
        console.log(this.msg);
        this.hasMsg = false;
        this.msg = '';
    }

    newline()
    {
        console.log('\n');
        return this;
    }

    error(msg)
    {
        let errmsg = chalk.redBright('ERROR: ') + chalk.red(msg);
        console.log(errmsg);
    }
}



module.exports = Terminal;