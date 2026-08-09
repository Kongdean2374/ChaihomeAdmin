import SwiftUI

extension Color {
    static let chaiBackground = Color(red: 0.035, green: 0.047, blue: 0.039)
    static let chaiSurface = Color(red: 0.075, green: 0.095, blue: 0.079)
    static let chaiGreen = Color(red: 0.55, green: 0.68, blue: 0.45)
    static let chaiSand = Color(red: 0.82, green: 0.70, blue: 0.50)
}

struct MultilineInput: View {
    let title: String
    let hint: String
    @Binding var text: String
    var minimumHeight: CGFloat = 110

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(hint)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: minimumHeight)
            }
            .padding(8)
            .background(Color.chaiBackground.opacity(0.75), in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

struct PrimaryActionButton: View {
    let title: String
    let symbol: String
    let disabled: Bool
    var tint: Color = .chaiGreen
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint)
        .disabled(disabled)
    }
}
