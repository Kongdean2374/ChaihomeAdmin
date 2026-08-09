import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.isConfigured {
                AdminConsoleView()
            } else {
                TokenSetupView()
            }
        }
        .background(Color.chaiBackground.ignoresSafeArea())
        .overlay {
            if model.isBusy {
                ZStack {
                    Color.black.opacity(0.35).ignoresSafeArea()
                    ProgressView("正在與網站同步…")
                        .padding(24)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
                }
            }
        }
        .alert(item: $model.presentedAlert) { item in
            Alert(
                title: Text(item.title),
                message: Text(item.message),
                dismissButton: .default(Text("好"))
            )
        }
    }
}

private struct TokenSetupView: View {
    @EnvironmentObject private var model: AppModel
    @State private var token = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: "shield.lefthalf.filled")
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(Color.chaiSand)
                        Text("連接官網管理 API")
                            .font(.largeTitle.bold())
                        Text("Token 只會儲存在這台 iPhone 的 Keychain，不會寫入 App、GitHub 或 iCloud 設定檔。")
                            .foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("ADMIN_TOKEN")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        SecureField("貼上 Cloudflare Worker Secret", text: $token)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(14)
                            .background(Color.chaiSurface, in: RoundedRectangle(cornerRadius: 14))
                    }

                    PrimaryActionButton(
                        title: "驗證並儲存",
                        symbol: "lock.shield",
                        disabled: token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isBusy
                    ) {
                        Task { await model.connect(token: token) }
                    }

                    Label("API：https://play.chaihome.cc", systemImage: "network")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(24)
            }
            .navigationTitle("柴柴官網管理")
            .background(Color.chaiBackground)
        }
    }
}

private struct AdminConsoleView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selectedFunction: AdminFunction = .news

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.title2)
                            .foregroundStyle(Color.chaiGreen)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(model.settings.serverName.isEmpty ? "柴柴生存伺服器" : model.settings.serverName)
                                .font(.headline)
                            Text("Cloudflare API 已連線")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(model.settings.serverVersion)
                            .font(.caption.monospaced().weight(.bold))
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(Color.chaiGreen.opacity(0.16), in: Capsule())
                    }
                }

                Section("選擇管理功能") {
                    Picker("功能", selection: $selectedFunction) {
                        ForEach(AdminFunction.allCases) { item in
                            Label(item.title, systemImage: item.symbol).tag(item)
                        }
                    }
                    .pickerStyle(.menu)

                    Label {
                        Text(selectedFunction.subtitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } icon: {
                        Image(systemName: selectedFunction.symbol)
                            .foregroundStyle(Color.chaiSand)
                    }
                }

                selectedForm
            }
            .scrollContentBackground(.hidden)
            .background(Color.chaiBackground)
            .navigationTitle("官網內容管理")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        Task { await model.refresh(showSuccess: true) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    Button(role: .destructive) { model.logout() } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var selectedForm: some View {
        switch selectedFunction {
        case .news: NewsForm()
        case .maintenance: MaintenanceForm()
        case .changelog: ChangelogForm()
        case .settings: SettingsForm()
        case .ticker: TickerForm()
        case .delete: DeleteContentForm()
        }
    }
}
