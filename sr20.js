const noble = require('@abandonware/noble');
const sharp = require('sharp');

class SR20Printer {

    constructor(mac) {

        this.mac = mac.toLowerCase();

        this.serviceUUID = 'fff0';
        this.writeUUID = 'fff2';
        this.notifyUUID = 'fff1';

        this.peripheral = null;
        this.writeChar = null;
        this.notifyChar = null;

        this.connected = false;
    }

    sleep(ms) {
        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }

    async connect() {

        if (this.connected) {
            return;
        }

        await new Promise((resolve, reject) => {

            const start = async () => {

                const discover =
                    async peripheral => {

                        if (
                            peripheral.address.toLowerCase() !==
                            this.mac
                        ) {
                            return;
                        }

                        try {

                            await noble.stopScanningAsync();

                            this.peripheral =
                                peripheral;

                            await peripheral.connectAsync();

                            const services =
                                await peripheral.discoverServicesAsync([
                                    this.serviceUUID
                                ]);

                            const chars =
                                await services[0]
                                    .discoverCharacteristicsAsync(
                                        []
                                    );

                            this.writeChar =
                                chars.find(
                                    c =>
                                        c.uuid ===
                                        this.writeUUID
                                );

                            this.notifyChar =
                                chars.find(
                                    c =>
                                        c.uuid ===
                                        this.notifyUUID
                                );

                            if (
                                this.notifyChar
                            ) {

                                await this.notifyChar.subscribeAsync();

                                this.notifyChar.on(
                                    'data',
                                    data => {

                                        console.log(
                                            'NOTIFY:',
                                            data.toString(
                                                'hex'
                                            )
                                        );
                                    });
                            }

                            this.connected = true;

                            noble.removeListener(
                                'discover',
                                discover
                            );

                            resolve();

                        } catch (err) {
                            reject(err);
                        }
                    };

                noble.on(
                    'discover',
                    discover
                );

                await noble.startScanningAsync(
                    [],
                    false
                );
            };

            if (
                noble.state ===
                'poweredOn'
            ) {
                start();
            } else {

                noble.once(
                    'stateChange',
                    state => {

                        if (
                            state ===
                            'poweredOn'
                        ) {
                            start();
                        }
                    });
            }
        });
    }

    async disconnect() {

        if (
            this.peripheral &&
            this.connected
        ) {

            await this.peripheral.disconnectAsync();

            this.connected = false;
        }
    }

    async send(buffer) {

        const chunkSize = 20;

        for (
            let i = 0;
            i < buffer.length;
            i += chunkSize
        ) {

            await this.writeChar.writeAsync(
                buffer.slice(
                    i,
                    i + chunkSize
                ),
                true
            );

            await this.sleep(5);
        }
    }

    async reset() {

        await this.send(
            Buffer.from([
                0x1B,
                0x40
            ])
        );
    }

    async text(text) {

        await this.send(
            Buffer.from(
                text,
                'utf8'
            )
        );
    }

    async feed(lines = 3) {

        await this.text(
            '\n'.repeat(lines)
        );
    }

    async center(enable = true) {

        await this.send(
            Buffer.from([
                0x1B,
                0x61,
                enable ? 1 : 0
            ])
        );
    }

    async bold(enable = true) {

        await this.send(
            Buffer.from([
                0x1B,
                0x45,
                enable ? 1 : 0
            ])
        );
    }

    async underline(enable = true) {

        await this.send(
            Buffer.from([
                0x1B,
                0x2D,
                enable ? 1 : 0
            ])
        );
    }

    async reverse(enable = true) {

        await this.send(
            Buffer.from([
                0x1D,
                0x42,
                enable ? 1 : 0
            ])
        );
    }

    async doubleSize(enable = true) {

        await this.send(
            Buffer.from([
                0x1D,
                0x21,
                enable ? 0x11 : 0
            ])
        );
    }

    async qr(data) {

        const qr =
            Buffer.from(data);

        await this.send(Buffer.from([
            0x1D, 0x28, 0x6B,
            0x04, 0x00,
            0x31, 0x41, 0x32, 0x00
        ]));

        await this.send(Buffer.from([
            0x1D, 0x28, 0x6B,
            0x03, 0x00,
            0x31, 0x43, 0x06
        ]));

        const store =
            Buffer.concat([
                Buffer.from([
                    0x1D, 0x28, 0x6B,
                    qr.length + 3,
                    0x00,
                    0x31, 0x50, 0x30
                ]),
                qr
            ]);

        await this.send(store);

        await this.send(Buffer.from([
            0x1D, 0x28, 0x6B,
            0x03, 0x00,
            0x31, 0x51, 0x30
        ]));
    }

    async barcode(data) {

        await this.send(Buffer.from([
            0x1D, 0x48, 0x02,
            0x1D, 0x68, 0x60,
            0x1D, 0x77, 0x03
        ]));

        const payload =
            Buffer.concat([
                Buffer.from([
                    0x1D,
                    0x6B,
                    0x49,
                    data.length
                ]),
                Buffer.from(data)
            ]);

        await this.send(payload);
    }

    async image(path) {

        const {
            data,
            info
        } = await sharp(path)
            .flatten({
                background: '#ffffff'
            })
            .resize({
                width: 384,
                fit: 'inside'
            })
            .grayscale()
            .threshold(128)
            .raw()
            .toBuffer({
                resolveWithObject: true
            });

        const bytesPerRow =
            Math.ceil(
                info.width / 8
            );

        const raster =
            Buffer.alloc(
                bytesPerRow *
                info.height
            );

        for (
            let y = 0;
            y < info.height;
            y++
        ) {

            for (
                let x = 0;
                x < info.width;
                x++
            ) {

                const pixel =
                    data[
                    y * info.width + x
                    ];

                if (
                    pixel < 128
                ) {

                    const idx =
                        y * bytesPerRow +
                        (x >> 3);

                    raster[idx] |=
                        (
                            0x80 >>
                            (x & 7)
                        );
                }
            }
        }

        const header =
            Buffer.from([
                0x1D,
                0x76,
                0x30,
                0x00,

                bytesPerRow & 0xff,
                (bytesPerRow >> 8),

                info.height & 0xff,
                (info.height >> 8)
            ]);

        await this.send(header);
        await this.send(raster);
    }
}

module.exports = SR20Printer;