// TekmeClassifier — Swift port of the compact TEKMĒ classifier (reference: ml/export/ios_model.py).
// STATUS: written on Windows, NEVER COMPILED OR RUN. Validate with `TekmeClassifierTests` on a Mac before use.
// Runs fully on-device: no networking APIs are used anywhere in this file.

import Foundation

public struct TekmeResult {
    public let probability: Double   // calibrated P(scam) from the compact model
    public let isJunk: Bool          // probability >= junk threshold (chosen for <= 1% validation FPR)
    public let compactText: String   // the normalised text the model saw (for debugging / tests)
}

public final class TekmeClassifier {
    private struct Model: Decodable {
        let format: String
        let terms: [String]
        let idf: [Double]
        let coef: [Double]
        let intercept: Double
        let platt_a: Double
        let platt_b: Double
        let junk_threshold: Double
        let patterns: [[String]]
        let rules: [[String]]
        let invisible: [String]
        let confusables: [String: String]
    }

    private let model: Model
    private let index: [String: Int]
    private let masks: [(String, NSRegularExpression)]
    private let rules: [(String, NSRegularExpression)]
    private let token: NSRegularExpression
    private let invisible: Set<Unicode.Scalar>
    private let confusables: [Unicode.Scalar: String]

    public var junkThreshold: Double { model.junk_threshold }

    /// Loads `tekme_compact.json` from the given bundle (the extension and the app each bundle a copy).
    public init(bundle: Bundle = .main) throws {
        guard let url = bundle.url(forResource: "tekme_compact", withExtension: "json") else {
            throw NSError(domain: "TEKME", code: 1, userInfo: [NSLocalizedDescriptionKey: "tekme_compact.json missing from bundle"])
        }
        model = try JSONDecoder().decode(Model.self, from: Data(contentsOf: url))
        guard model.format == "tekme-compact/1", model.terms.count == model.idf.count, model.terms.count == model.coef.count else {
            throw NSError(domain: "TEKME", code: 2, userInfo: [NSLocalizedDescriptionKey: "unexpected model format"])
        }
        var idx = [String: Int](minimumCapacity: model.terms.count)
        for (i, t) in model.terms.enumerated() { idx[t] = i }
        index = idx
        masks = try model.patterns.map { ($0[0], try NSRegularExpression(pattern: $0[1], options: [.caseInsensitive])) }
        rules = try model.rules.map { ($0[0], try NSRegularExpression(pattern: $0[1], options: [])) }
        // Python: [^\W]+  ==  letters, numbers and underscore
        token = try NSRegularExpression(pattern: "[\\p{L}\\p{N}_]+", options: [])
        // Python iterates code points, so these maps are keyed by Unicode scalars (not grapheme clusters:
        // a zero-width joiner between two letters would otherwise be merged into the preceding Character).
        invisible = Set(model.invisible.compactMap { $0.unicodeScalars.first })
        var conf = [Unicode.Scalar: String]()
        for (k, v) in model.confusables { if let c = k.unicodeScalars.first { conf[c] = v } }
        confusables = conf
    }

    /// Mirrors `compact_text` in ml/export/ios_model.py step by step.
    public func compactText(_ raw: String) -> String {
        var scalars = String.UnicodeScalarView()
        scalars.append(contentsOf: raw.unicodeScalars.filter { !invisible.contains($0) })
        var t = String(scalars).unicodeScalars.map { confusables[$0] ?? String($0) }.joined()
        t = t.precomposedStringWithCompatibilityMapping            // NFKC
        for (tag, re) in masks {
            let ns = t as NSString
            t = re.stringByReplacingMatches(in: t, options: [], range: NSRange(location: 0, length: ns.length), withTemplate: " \(tag) ")
        }
        t = t.lowercased()
        let ns = t as NSString
        let toks = token.matches(in: t, options: [], range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
        let flat = toks.joined(separator: " ")
        let fns = flat as NSString
        let extra = rules.filter { $0.1.firstMatch(in: flat, options: [], range: NSRange(location: 0, length: fns.length)) != nil }.map { $0.0 }
        return (toks + extra).joined(separator: " ")
    }

    public func classify(_ text: String) -> TekmeResult {
        let ct = compactText(text)
        let words = ct.split(separator: " ").map(String.init)
        var counts = [Int: Double]()
        func add(_ term: String) { if let j = index[term] { counts[j, default: 0] += 1 } }
        for w in words { add(w) }
        if words.count >= 2 { for i in 0..<(words.count - 1) { add(words[i] + " " + words[i + 1]) } }
        var vec = [Int: Double]()
        var norm = 0.0
        for (j, c) in counts {
            let v = (1 + log(c)) * model.idf[j]          // sublinear tf * idf
            vec[j] = v
            norm += v * v
        }
        norm = norm.squareRoot()
        var z = model.intercept
        if norm > 0 { for (j, v) in vec { z += model.coef[j] * v / norm } }
        let p = 1 / (1 + exp(-(model.platt_a * z + model.platt_b)))
        return TekmeResult(probability: p, isJunk: p >= model.junk_threshold, compactText: ct)
    }
}
