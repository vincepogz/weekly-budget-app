package com.example.ui.screens

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.data.model.AccountType
import com.example.data.sync.ImportConflictMode
import com.example.ui.theme.EmeraldPrimaryLight
import com.example.ui.theme.IncomeGreen
import com.example.ui.viewmodel.BudgetUiState
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncAndAccountsScreen(
    state: BudgetUiState,
    onTriggerSync: () -> Unit,
    onUpdateSheetConfig: (String, String) -> Unit,
    onImportSpreadsheetText: (String) -> Unit,
    onExportBackup: (File, (Boolean, String) -> Unit) -> Unit,
    onResetToSeedData: () -> Unit,
    onAddAccount: (name: String, type: AccountType, startingBalance: Double, targetAmount: Double, colorHex: String) -> Unit
) {
    val context = LocalContext.current
    var showSheetConfigDialog by remember { mutableStateOf(false) }
    var showImportTextDialog by remember { mutableStateOf(false) }
    var showAddAccountDialog by remember { mutableStateOf(false) }
    var showResetConfirmDialog by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 96.dp)
    ) {
        // 1. Google Drive & Google Sheets Master Sync Hub
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.CloudSync, contentDescription = "Sync", tint = MaterialTheme.colorScheme.onPrimaryContainer)
                            Text(
                                text = "GOOGLE SHEETS MASTER SYNC",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                        IconButton(onClick = { showSheetConfigDialog = true }) {
                            Icon(Icons.Default.Settings, contentDescription = "Config", tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Master File: ${state.masterSheetName}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Target ID: ${state.masterSheetId}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                    )
                    Text(
                        text = "Last Synced: ${state.lastSyncTimestamp}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f)
                    )

                    if (!state.syncStatusMessage.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = state.syncStatusMessage,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = onTriggerSync,
                        enabled = !state.isSyncing,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (state.isSyncing) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Syncing to Google Sheets...")
                        } else {
                            Icon(Icons.Default.Sync, contentDescription = "Sync")
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Sync Now to Master Sheet")
                        }
                    }
                }
            }
        }

        // 2. Portable Data & Device-to-Device Transfer Hub
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Data Portability & Device Transfer",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Export self-contained ZIP/JSON backup packages to transfer your complete budget to another device or restore from a file.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                val exportFile = File(context.cacheDir, "budget-app-export.zip")
                                onExportBackup(exportFile) { success, msg ->
                                    Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.UploadFile, contentDescription = "Export")
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Export ZIP")
                        }

                        OutlinedButton(
                            onClick = {
                                val backupManager = com.example.data.sync.PortableBackupManager(context)
                                val csv = backupManager.exportTransactionsCsv(state.transactions, state.accounts)
                                val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Transactions CSV", csv))
                                Toast.makeText(context, "Exported ${state.transactions.size} transactions to CSV (copied to clipboard)", Toast.LENGTH_LONG).show()
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.TableChart, contentDescription = "CSV")
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Export CSV")
                        }

                        Button(
                            onClick = { showImportTextDialog = true },
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = "Import")
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Import")
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(
                        onClick = { showResetConfirmDialog = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.RestartAlt, contentDescription = "Reset", tint = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Reset to Reference Google Sheets Tabs", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        // 3. Accounts & Sinking Funds Section
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Managed Accounts & Goals",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                IconButton(onClick = { showAddAccountDialog = true }) {
                    Icon(Icons.Default.AddCircleOutline, contentDescription = "Add Account")
                }
            }
        }

        items(state.accounts) { acc ->
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(acc.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                        Text("Type: ${acc.type} • Target: $%.2f".format(acc.targetAmount), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = "$%.2f".format(state.balanceOf(acc.id)),
                            fontWeight = FontWeight.ExtraBold,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "Cleared: $%.2f".format(state.clearedBalanceOf(acc.id)),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }

    // Google Sheets Config Dialog
    if (showSheetConfigDialog) {
        var sheetId by remember { mutableStateOf(state.masterSheetId) }
        var sheetName by remember { mutableStateOf(state.masterSheetName) }

        AlertDialog(
            onDismissRequest = { showSheetConfigDialog = false },
            title = { Text("Configure Google Sheets Master") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Enter your Master Google Sheet ID or Google Drive Spreadsheet URL:")
                    OutlinedTextField(
                        value = sheetName,
                        onValueChange = { sheetName = it },
                        label = { Text("Sheet Name / Label") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = sheetId,
                        onValueChange = { sheetId = it },
                        label = { Text("Google Sheet ID or URL") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        onUpdateSheetConfig(sheetId, sheetName)
                        showSheetConfigDialog = false
                    }
                ) {
                    Text("Save Config")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSheetConfigDialog = false }) { Text("Cancel") }
            }
        )
    }

    // Spreadsheet Text Importer Dialog
    if (showImportTextDialog) {
        var rawText by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showImportTextDialog = false },
            title = { Text("Import Google Sheet Data") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Paste CSV or copied tab cells from your Google Sheets budget (supports contributors, allocations, and budget breakdown):",
                        style = MaterialTheme.typography.bodySmall
                    )
                    OutlinedTextField(
                        value = rawText,
                        onValueChange = { rawText = it },
                        placeholder = { Text("Paste spreadsheet content here...") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (rawText.isNotBlank()) {
                            onImportSpreadsheetText(rawText)
                            showImportTextDialog = false
                        }
                    }
                ) {
                    Text("Parse & Import")
                }
            },
            dismissButton = {
                TextButton(onClick = { showImportTextDialog = false }) { Text("Cancel") }
            }
        )
    }

    // Add Account Dialog
    if (showAddAccountDialog) {
        var name by remember { mutableStateOf("") }
        var type by remember { mutableStateOf(AccountType.CHECKING) }
        var balanceText by remember { mutableStateOf("") }
        var targetText by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showAddAccountDialog = false },
            title = { Text("Add Account / Sinking Fund") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Account Name (e.g. Cruise, Car)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = balanceText,
                        onValueChange = { balanceText = it },
                        label = { Text("Starting Balance ($)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = targetText,
                        onValueChange = { targetText = it },
                        label = { Text("Target Goal Amount ($)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val bal = balanceText.toDoubleOrNull() ?: 0.0
                        val target = targetText.toDoubleOrNull() ?: 0.0
                        if (name.isNotBlank()) {
                            onAddAccount(name, type, bal, target, "#006C4C")
                            showAddAccountDialog = false
                        }
                    }
                ) {
                    Text("Add")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddAccountDialog = false }) { Text("Cancel") }
            }
        )
    }

    // Reset Confirm Dialog
    if (showResetConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showResetConfirmDialog = false },
            title = { Text("Reset to Reference Spreadsheets?") },
            text = {
                Text("This will reload your original spreadsheet cycles: NEW YEAR (5 Wks), NO AMEX (22 Wks), JENN BROKE (15 Wks), SCHOOL (14 Wks), and the Weekly Income Generator.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        onResetToSeedData()
                        showResetConfirmDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Reset")
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetConfirmDialog = false }) { Text("Cancel") }
            }
        )
    }
}
