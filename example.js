const SR20Printer =
    require('./sr20');

async function main() {

    const printer =
        new SR20Printer(
            'c8:47:60:7b:79:45'
        );

    try {

        await printer.connect();

        await printer.reset();

        await printer.center();
        await printer.doubleSize();
        await printer.text(
            'SR20 DRIVER\n'
        );

        await printer.doubleSize(false);
        await printer.center(false);

        await printer.feed();

        await printer.bold();
        await printer.text(
            'Bold Text\n'
        );
        await printer.bold(false);

        await printer.underline();
        await printer.text(
            'Underline\n'
        );
        await printer.underline(false);

        await printer.reverse();
        await printer.text(
            'Reverse Text\n'
        );
        await printer.reverse(false);

        await printer.feed();

        await printer.text(
            'QR CODE:\n'
        );

        await printer.qr(
            'https://example.com'
        );

        await printer.feed();

        await printer.text(
            'BARCODE:\n'
        );

        await printer.barcode(
            '123456789012'
        );

        await printer.feed();

        await printer.text(
            'LOGO:\n'
        );

        await printer.image(
            './logo.png'
        );

        await printer.feed(5);

        console.log(
            'Print complete'
        );

    } finally {

        await printer.disconnect();
    }
}

main().catch(console.error);