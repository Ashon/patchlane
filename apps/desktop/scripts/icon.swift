import AppKit

// Render the paths and colors from apps/web/public/favicon.svg at each macOS icon size.
let destination = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: destination, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        let context = NSGraphicsContext(bitmapImageRep: bitmap)!.cgContext
        context.translateBy(x: 0, y: CGFloat(pixels))
        context.scaleBy(x: CGFloat(pixels) / 32, y: -CGFloat(pixels) / 32)
        context.saveGState()
        context.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 32, height: 32),
            cornerWidth: 8, cornerHeight: 8, transform: nil))
        context.clip()
        let colors = [CGColor(red: 34/255, green: 0, blue: 1, alpha: 1),
                      CGColor(red: 95/255, green: 41/255, blue: 1, alpha: 1)]
        let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: colors as CFArray, locations: [0, 1])!
        context.drawLinearGradient(gradient, start: CGPoint(x: 5, y: 5), end: CGPoint(x: 27, y: 27),
            options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        context.restoreGState()
        context.setStrokeColor(CGColor(gray: 1, alpha: 1))
        context.setLineWidth(2.4)
        context.setLineCap(.round)
        context.setLineJoin(.round)
        context.strokeEllipse(in: CGRect(x: 6, y: 7, width: 6, height: 6))
        context.move(to: CGPoint(x: 9, y: 13))
        context.addLine(to: CGPoint(x: 9, y: 25))
        context.strokePath()
        context.strokeEllipse(in: CGRect(x: 20, y: 19, width: 6, height: 6))
        context.move(to: CGPoint(x: 19, y: 13))
        context.addLine(to: CGPoint(x: 16, y: 10))
        context.addLine(to: CGPoint(x: 19, y: 7))
        context.strokePath()
        context.move(to: CGPoint(x: 16, y: 10))
        context.addLine(to: CGPoint(x: 21, y: 10))
        context.addQuadCurve(to: CGPoint(x: 23, y: 12), control: CGPoint(x: 23, y: 10))
        context.addLine(to: CGPoint(x: 23, y: 19))
        context.strokePath()
        let suffix = scale == 2 ? "@2x" : ""
        let file = URL(fileURLWithPath: destination).appendingPathComponent("icon_\(size)x\(size)\(suffix).png")
        try bitmap.representation(using: .png, properties: [:])!.write(to: file)
    }
}
