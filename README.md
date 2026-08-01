# GatePaint

A little browser game where you paint a pixel canvas using logic gates.

Every pixel's (x, y) coordinate is fed into a single circuit you build out of
gates (AND, OR, NOT, XOR, NAND). The circuit decides whether each pixel is on
or off, so one rule fills the whole canvas at once. `NOT x1` paints vertical
stripes, `x0 XOR y0` gives a checkerboard. It turns out logic on the coordinate
bits is really just geometry.

I made this as a simple game, a toy to mess around with.

## Run it

```bash
npm install
npm run dev
```

Then open the local URL it prints.
