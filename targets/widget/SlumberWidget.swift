import WidgetKit
import SwiftUI

// MARK: - Shared Data

struct WakeEntry: Codable {
    let date: String      // "2026-03-01"
    let wakeTime: String  // ISO 8601
}

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
    guard let defaults = UserDefaults(suiteName: appGroupID),
          let data = defaults.string(forKey: storageKey)?.data(using: .utf8) else {
        return []
    }
    return (try? JSONDecoder().decode([SleepSession].self, from: data)) ?? []
}

func getWeekRange() -> (start: String, end: String) {
    let cal = Calendar.current
    let today = Date()
    let start = cal.date(byAdding: .day, value: -6, to: today)!

    let fmt = DateFormatter()
    fmt.dateFormat = "yyyy-MM-dd"
    return (fmt.string(from: start), fmt.string(from: today))
}

struct WakeDataPoint {
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
    for pattern in ["yyyy-MM-dd'T'HH:mm:ss.SSSZ", "yyyy-MM-dd'T'HH:mm:ssZ", "yyyy-MM-dd'T'HH:mm:ss"] {
        df.dateFormat = pattern
        if let d = df.date(from: str) { return d }
    }
    return nil
}

func weeklyWakeData() -> [WakeDataPoint] {
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

    return (0..<7).map { i in
        let d = cal.date(byAdding: .day, value: i, to: startDate)!
        let ds = fmt.string(from: d)
        let label = dayFmt.string(from: d)

        if let session = sessions.first(where: { $0.date == ds }),
           let wakeDate = parseISO(session.wakeTime) {
            let hour = Double(cal.component(.hour, from: wakeDate)) +
                       Double(cal.component(.minute, from: wakeDate)) / 60.0
            return WakeDataPoint(
                dayLabel: label,
                wakeHour: hour,
                wakeTimeFormatted: timeFmt.string(from: wakeDate)
            )
        }

        return WakeDataPoint(dayLabel: label, wakeHour: nil, wakeTimeFormatted: nil)
    }
}

// MARK: - Timeline

struct WakeTimelineEntry: TimelineEntry {
    let date: Date
    let wakeData: [WakeDataPoint]
}

struct WakeTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> WakeTimelineEntry {
        WakeTimelineEntry(date: Date(), wakeData: sampleData())
    }

    func getSnapshot(in context: Context, completion: @escaping (WakeTimelineEntry) -> Void) {
        completion(WakeTimelineEntry(date: Date(), wakeData: weeklyWakeData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WakeTimelineEntry>) -> Void) {
        let entry = WakeTimelineEntry(date: Date(), wakeData: weeklyWakeData())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    func sampleData() -> [WakeDataPoint] {
        let labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        let hours: [Double?] = [7.0, 6.5, 7.25, nil, 8.0, 9.5, nil]
        return zip(labels, hours).map { WakeDataPoint(dayLabel: $0.0, wakeHour: $0.1, wakeTimeFormatted: $0.1 != nil ? "\(Int($0.1!)):\(String(format: "%02d", Int(($0.1!.truncatingRemainder(dividingBy: 1)) * 60))) AM" : nil) }
    }
}

// MARK: - Chart View

struct WakeChartView: View {
    let data: [WakeDataPoint]

    private var minHour: Double {
        let hours = data.compactMap { $0.wakeHour }
        guard !hours.isEmpty else { return 6 }
        return Double(max(0, Int(hours.min()!) - 1))
    }

    private var maxHour: Double {
        let hours = data.compactMap { $0.wakeHour }
        guard !hours.isEmpty else { return 10 }
        return Double(min(24, Int(ceil(hours.max()!)) + 1))
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let leftPad: CGFloat = 30
            let rightPad: CGFloat = 14
            let topPad: CGFloat = 6
            let bottomPad: CGFloat = 18
            let plotW = w - leftPad - rightPad
            let plotH = h - topPad - bottomPad
            let hourRange = max(maxHour - minHour, 2)

            ZStack(alignment: .topLeading) {
                ForEach(Int(minHour)...Int(maxHour), id: \.self) { hour in
                    let frac = CGFloat(Double(hour) - minHour) / CGFloat(hourRange)
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

                // Day labels
                ForEach(0..<7, id: \.self) { i in
                    let x = leftPad + (CGFloat(i) / 6.0) * plotW
                    Text(data[i].dayLabel)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(Color.white.opacity(0.5))
                        .position(x: x, y: h - 6)
                }

                // Line connecting valid points
                let validPoints = validChartPoints(plotW: plotW, plotH: plotH, leftPad: leftPad, topPad: topPad, hourRange: hourRange)

                if validPoints.count >= 2 {
                    Path { path in
                        path.move(to: validPoints[0])
                        for i in 1..<validPoints.count {
                            path.addLine(to: validPoints[i])
                        }
                    }
                    .stroke(
                        Color(red: 0.96, green: 0.62, blue: 0.04),
                        style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round)
                    )
                }

                // Dots
                ForEach(0..<validPoints.count, id: \.self) { i in
                    Circle()
                        .fill(Color(red: 0.96, green: 0.62, blue: 0.04))
                        .frame(width: 8, height: 8)
                        .overlay(
                            Circle()
                                .stroke(Color(red: 0.03, green: 0.05, blue: 0.09), lineWidth: 2)
                        )
                        .position(validPoints[i])
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

    private func validChartPoints(plotW: CGFloat, plotH: CGFloat, leftPad: CGFloat, topPad: CGFloat, hourRange: Double) -> [CGPoint] {
        var points: [CGPoint] = []
        for i in 0..<7 {
            guard let wh = data[i].wakeHour else { continue }
            let x = leftPad + (CGFloat(i) / 6.0) * plotW
            let frac = CGFloat((wh - minHour) / hourRange)
            let y = topPad + frac * plotH
            points.append(CGPoint(x: x, y: y))
        }
        return points
    }
}

// MARK: - Widget View

struct SlumberWidgetView: View {
    let entry: WakeTimelineEntry

    var body: some View {
        ZStack {
            // Background
            Color(red: 0.03, green: 0.05, blue: 0.09)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: "sunrise.fill")
                        .font(.system(size: 11))
                        .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                    Text("Wake-Up Times")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                    Spacer()
                    Text("This Week")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Color.white.opacity(0.4))
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                WakeChartView(data: entry.wakeData)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)
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
                wakeData: WakeTimelineProvider().sampleData()
            )
        )
        .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
