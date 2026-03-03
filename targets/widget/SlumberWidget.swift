import WidgetKit
import SwiftUI

// MARK: - Shared Data

struct SleepSession: Codable {
    let id: String
    let date: String
    let sleepOnset: String
    let wakeTime: String
    let durationMinutes: Int
    let qualityScore: Int
    let notes: String?
    let source: String
    let createdAt: String
    let updatedAt: String
}

let appGroupID = "group.com.slumber.sleeptracker"
let storageKey = "slumber:sessions:v1"

func loadSessions() -> [SleepSession] {
    let fileName = storageKey.replacingOccurrences(of: ":", with: "_") + ".json"

    if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) {
        let fileURL = containerURL.appendingPathComponent(fileName)
        if let data = try? Data(contentsOf: fileURL),
           let sessions = try? JSONDecoder().decode([SleepSession].self, from: data) {
            return sessions
        }
    }

    if let defaults = UserDefaults(suiteName: appGroupID),
       let str = defaults.string(forKey: storageKey),
       let data = str.data(using: .utf8),
       let sessions = try? JSONDecoder().decode([SleepSession].self, from: data) {
        return sessions
    }

    return []
}

func getWeekRange() -> (start: String, end: String) {
    let cal = Calendar.current
    let today = Date()
    let start = cal.date(byAdding: .day, value: -6, to: today)!

    let fmt = DateFormatter()
    fmt.dateFormat = "yyyy-MM-dd"
    return (fmt.string(from: start), fmt.string(from: today))
}

struct WakeDataPoint: Identifiable {
    let id: Int
    let dayLabel: String
    let wakeHour: Double?
    let wakeTimeFormatted: String?
}

func parseISO(_ str: String) -> Date? {
    let fmtA = ISO8601DateFormatter()
    fmtA.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = fmtA.date(from: str) { return d }

    let fmtB = ISO8601DateFormatter()
    fmtB.formatOptions = [.withInternetDateTime]
    if let d = fmtB.date(from: str) { return d }

    let df = DateFormatter()
    df.locale = Locale(identifier: "en_US_POSIX")
    for pattern in [
        "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
        "yyyy-MM-dd'T'HH:mm:ss.SSS",
        "yyyy-MM-dd'T'HH:mm:ssZ",
        "yyyy-MM-dd'T'HH:mm:ss"
    ] {
        df.dateFormat = pattern
        if let d = df.date(from: str) { return d }
    }
    return nil
}

struct WeeklyResult {
    let points: [WakeDataPoint]
    let totalSessions: Int
    let matchedCount: Int
    let debugInfo: String
}

func weeklyWakeData() -> WeeklyResult {
    let sessions = loadSessions()
    let range = getWeekRange()

    let fmt = DateFormatter()
    fmt.dateFormat = "yyyy-MM-dd"
    let startDate = fmt.date(from: range.start)!

    let cal = Calendar.current
    let timeFmt = DateFormatter()
    timeFmt.dateFormat = "h:mm a"

    let dayFmt = DateFormatter()
    dayFmt.dateFormat = "EEE"

    var matched = 0
    var chartDates: [String] = []

    let points: [WakeDataPoint] = (0..<7).map { i in
        let d = cal.date(byAdding: .day, value: i, to: startDate)!
        let ds = fmt.string(from: d)
        chartDates.append(ds)
        let label = dayFmt.string(from: d)

        if let session = sessions.first(where: { $0.date == ds }),
           let wakeDate = parseISO(session.wakeTime) {
            let hour = Double(cal.component(.hour, from: wakeDate)) +
                       Double(cal.component(.minute, from: wakeDate)) / 60.0
            matched += 1
            return WakeDataPoint(
                id: i,
                dayLabel: label,
                wakeHour: hour,
                wakeTimeFormatted: timeFmt.string(from: wakeDate)
            )
        }

        return WakeDataPoint(id: i, dayLabel: label, wakeHour: nil, wakeTimeFormatted: nil)
    }

    let sessionDates = sessions.map { $0.date }.joined(separator: ",")
    let slotRange = "\(chartDates.first ?? "?")→\(chartDates.last ?? "?")"
    let debug = "S:\(sessionDates) R:\(slotRange)"

    return WeeklyResult(points: points, totalSessions: sessions.count, matchedCount: matched, debugInfo: debug)
}

// MARK: - Timeline

struct WakeTimelineEntry: TimelineEntry {
    let date: Date
    let wakeData: [WakeDataPoint]
    let totalSessions: Int
    let matchedCount: Int
    let debugInfo: String
}

struct WakeTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> WakeTimelineEntry {
        let sample = sampleData()
        return WakeTimelineEntry(date: Date(), wakeData: sample, totalSessions: 5, matchedCount: 5, debugInfo: "placeholder")
    }

    func getSnapshot(in context: Context, completion: @escaping (WakeTimelineEntry) -> Void) {
        let result = weeklyWakeData()
        completion(WakeTimelineEntry(date: Date(), wakeData: result.points, totalSessions: result.totalSessions, matchedCount: result.matchedCount, debugInfo: result.debugInfo))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WakeTimelineEntry>) -> Void) {
        let result = weeklyWakeData()
        let entry = WakeTimelineEntry(date: Date(), wakeData: result.points, totalSessions: result.totalSessions, matchedCount: result.matchedCount, debugInfo: result.debugInfo)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    func sampleData() -> [WakeDataPoint] {
        let labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        let hours: [Double?] = [7.0, 6.5, 7.25, nil, 8.0, 9.5, nil]
        return zip(labels, hours).enumerated().map { (idx, pair) in
            WakeDataPoint(
                id: idx,
                dayLabel: pair.0,
                wakeHour: pair.1,
                wakeTimeFormatted: pair.1.map { h in
                    let hr = Int(h)
                    let mn = Int((h.truncatingRemainder(dividingBy: 1)) * 60)
                    return "\(hr):\(String(format: "%02d", mn)) AM"
                }
            )
        }
    }
}

// MARK: - Chart View

struct WakeChartView: View {
    let data: [WakeDataPoint]

    private var validHours: [Double] {
        data.compactMap { $0.wakeHour }
    }

    private var computedMinHour: Double {
        guard !validHours.isEmpty else { return 6 }
        return floor(max(0, validHours.min()! - 1))
    }

    private var computedMaxHour: Double {
        guard !validHours.isEmpty else { return 10 }
        return ceil(min(24, validHours.max()! + 1))
    }

    var body: some View {
        let mn = computedMinHour
        let mx = computedMaxHour
        let range = max(mx - mn, 2.0)

        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let leftPad: CGFloat = 30
            let rightPad: CGFloat = 10
            let topPad: CGFloat = 8
            let bottomPad: CGFloat = 18
            let plotW = w - leftPad - rightPad
            let plotH = h - topPad - bottomPad

            ZStack(alignment: .topLeading) {
                ForEach(Int(mn)...Int(mx), id: \.self) { hour in
                    let frac = CGFloat(Double(hour) - mn) / CGFloat(range)
                    let y = topPad + frac * plotH

                    Path { path in
                        path.move(to: CGPoint(x: leftPad, y: y))
                        path.addLine(to: CGPoint(x: w - rightPad, y: y))
                    }
                    .stroke(Color.white.opacity(0.08), lineWidth: 0.5)

                    Text(hourLabel(hour))
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(Color.white.opacity(0.35))
                        .position(x: leftPad - 14, y: y)
                }

                ForEach(0..<7, id: \.self) { i in
                    let x = leftPad + (CGFloat(i) / 6.0) * plotW
                    Text(data[i].dayLabel)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(Color.white.opacity(0.5))
                        .position(x: x, y: h - 4)
                }

                let pts = chartPoints(mn: mn, range: range, plotW: plotW, plotH: plotH, leftPad: leftPad, topPad: topPad)

                if pts.count >= 2 {
                    Path { path in
                        path.move(to: pts[0])
                        for i in 1..<pts.count {
                            path.addLine(to: pts[i])
                        }
                    }
                    .stroke(
                        Color(red: 0.96, green: 0.62, blue: 0.04),
                        style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round)
                    )
                }

                ForEach(0..<pts.count, id: \.self) { i in
                    Circle()
                        .fill(Color(red: 0.96, green: 0.62, blue: 0.04))
                        .frame(width: 8, height: 8)
                        .overlay(
                            Circle()
                                .stroke(Color(red: 0.03, green: 0.05, blue: 0.09), lineWidth: 2)
                        )
                        .position(pts[i])
                }
            }
        }
    }

    private func hourLabel(_ h: Int) -> String {
        if h == 0 { return "12a" }
        if h < 12 { return "\(h)a" }
        if h == 12 { return "12p" }
        return "\(h - 12)p"
    }

    private func chartPoints(mn: Double, range: Double, plotW: CGFloat, plotH: CGFloat, leftPad: CGFloat, topPad: CGFloat) -> [CGPoint] {
        var points: [CGPoint] = []
        for i in 0..<7 {
            guard let wh = data[i].wakeHour else { continue }
            let x = leftPad + (CGFloat(i) / 6.0) * plotW
            let frac = CGFloat(max(0, min(1, (wh - mn) / range)))
            let y = topPad + frac * plotH
            points.append(CGPoint(x: x, y: y))
        }
        return points
    }
}

// MARK: - Widget View

struct SlumberWidgetView: View {
    let entry: WakeTimelineEntry

    private let amber = Color(red: 0.96, green: 0.62, blue: 0.04)
    private let bg = Color(red: 0.03, green: 0.05, blue: 0.09)

    private var hasData: Bool {
        entry.wakeData.contains { $0.wakeHour != nil }
    }

    var body: some View {
        ZStack {
            bg

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: "sunrise.fill")
                        .font(.system(size: 11))
                        .foregroundColor(amber)
                    Text("Wake-Up Times")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                    Spacer()
                    Text("\(entry.matchedCount)/\(entry.totalSessions)s")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundColor(Color.white.opacity(0.25))
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                Text(entry.debugInfo)
                    .font(.system(size: 7, weight: .regular, design: .monospaced))
                    .foregroundColor(Color.white.opacity(0.2))
                    .lineLimit(2)
                    .padding(.horizontal, 16)

                if hasData {
                    WakeChartView(data: entry.wakeData)
                        .padding(.horizontal, 8)
                        .padding(.bottom, 8)
                } else {
                    Spacer()
                    VStack(spacing: 4) {
                        Image(systemName: "moon.zzz")
                            .font(.system(size: 20))
                            .foregroundColor(Color.white.opacity(0.2))
                        Text("No wake data this week")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color.white.opacity(0.3))
                        Text("Open Slumber to sync")
                            .font(.system(size: 9))
                            .foregroundColor(Color.white.opacity(0.2))
                    }
                    .frame(maxWidth: .infinity)
                    Spacer()
                }
            }
        }
    }
}

// MARK: - Widget Definition

@main
struct SlumberWidget: Widget {
    let kind: String = "SlumberWakeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WakeTimelineProvider()) { entry in
            SlumberWidgetView(entry: entry)
                .containerBackground(Color(red: 0.03, green: 0.05, blue: 0.09), for: .widget)
        }
        .configurationDisplayName("Wake-Up Times")
        .description("Your weekly wake-up pattern at a glance.")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

// MARK: - Previews

struct SlumberWidget_Previews: PreviewProvider {
    static var previews: some View {
        SlumberWidgetView(
            entry: WakeTimelineEntry(
                date: Date(),
                wakeData: WakeTimelineProvider().sampleData(),
                totalSessions: 5,
                matchedCount: 5,
                debugInfo: "preview"
            )
        )
        .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
