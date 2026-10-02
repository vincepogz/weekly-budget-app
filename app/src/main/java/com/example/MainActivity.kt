package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.model.*
import com.example.ui.components.TransactionDialog
import com.example.ui.components.NewPeriodDialog
import com.example.ui.screens.*
import com.example.ui.theme.EmeraldPrimaryLight
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.viewmodel.BudgetViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: BudgetViewModel by viewModels()

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                val state by viewModel.uiState.collectAsStateWithLifecycle()
                var selectedTabIndex by remember { mutableIntStateOf(0) }
                var showPeriodMenu by remember { mutableStateOf(false) }
                var showNewPeriodDialog by remember { mutableStateOf(false) }
                var showAddTransactionDialog by remember { mutableStateOf(false) }

                val snackbarHostState = remember { SnackbarHostState() }

                LaunchedEffect(state.syncStatusMessage) {
                    state.syncStatusMessage?.let { msg ->
                        snackbarHostState.showSnackbar(msg)
                        viewModel.clearStatusMessage()
                    }
                }

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    snackbarHost = { SnackbarHost(snackbarHostState) },
                    topBar = {
                        TopAppBar(
                            title = {
                                Column {
                                    Text(
                                        text = "Weekly Budget",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = state.currentPeriod?.name ?: "No Cycle",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            },
                            actions = {
                                // Period Selector Dropdown
                                Box {
                                    FilledTonalButton(
                                        onClick = { showPeriodMenu = true },
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.DateRange, contentDescription = "Cycles", modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Cycles (${state.periods.size})")
                                    }

                                    DropdownMenu(
                                        expanded = showPeriodMenu,
                                        onDismissRequest = { showPeriodMenu = false }
                                    ) {
                                        state.periods.forEach { period ->
                                            DropdownMenuItem(
                                                text = {
                                                    Column {
                                                        Text(
                                                            text = period.name,
                                                            fontWeight = if (period.id == state.currentPeriod?.id) FontWeight.Bold else FontWeight.Normal
                                                        )
                                                        Text(
                                                            text = "${period.numberOfWeeks} Wks • ${period.startDate}",
                                                            style = MaterialTheme.typography.labelSmall
                                                        )
                                                    }
                                                },
                                                onClick = {
                                                    viewModel.selectPeriod(period.id)
                                                    showPeriodMenu = false
                                                },
                                                trailingIcon = {
                                                    if (period.id == state.currentPeriod?.id) {
                                                        Icon(Icons.Default.Check, contentDescription = "Active", tint = EmeraldPrimaryLight)
                                                    }
                                                }
                                            )
                                        }
                                        HorizontalDivider()
                                        DropdownMenuItem(
                                            text = { Text("+ New Budget Cycle") },
                                            leadingIcon = { Icon(Icons.Default.Add, contentDescription = "Add Cycle") },
                                            onClick = {
                                                showPeriodMenu = false
                                                showNewPeriodDialog = true
                                            }
                                        )
                                    }
                                }

                                IconButton(onClick = { viewModel.triggerGoogleSheetsSync() }) {
                                    Icon(
                                        Icons.Default.CloudSync,
                                        contentDescription = "Sync Master Sheet",
                                        tint = if (state.isSyncing) EmeraldPrimaryLight else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        )
                    },
                    bottomBar = {
                        NavigationBar(
                            windowInsets = WindowInsets.navigationBars
                        ) {
                            NavigationBarItem(
                                selected = selectedTabIndex == 0,
                                onClick = { selectedTabIndex = 0 },
                                icon = { Icon(Icons.Default.Dashboard, contentDescription = "Dashboard") },
                                label = { Text("Dashboard") }
                            )
                            NavigationBarItem(
                                selected = selectedTabIndex == 1,
                                onClick = { selectedTabIndex = 1 },
                                icon = { Icon(Icons.Default.PieChart, contentDescription = "Breakdown") },
                                label = { Text("Budget") }
                            )
                            NavigationBarItem(
                                selected = selectedTabIndex == 2,
                                onClick = { selectedTabIndex = 2 },
                                icon = { Icon(Icons.Default.People, contentDescription = "Cash Flow") },
                                label = { Text("Cash Flow") }
                            )
                            NavigationBarItem(
                                selected = selectedTabIndex == 3,
                                onClick = { selectedTabIndex = 3 },
                                icon = { Icon(Icons.Default.ReceiptLong, contentDescription = "Ledger") },
                                label = { Text("Ledger") }
                            )
                            NavigationBarItem(
                                selected = selectedTabIndex == 4,
                                onClick = { selectedTabIndex = 4 },
                                icon = { Icon(Icons.Default.CloudSync, contentDescription = "Drive Sync") },
                                label = { Text("Drive Sync") }
                            )
                        }
                    }
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        when (selectedTabIndex) {
                            0 -> DashboardScreen(
                                state = state,
                                onAddTransactionClick = { showAddTransactionDialog = true },
                                onSyncClick = { viewModel.triggerGoogleSheetsSync() },
                                onNavigateToBudget = { selectedTabIndex = 1 },
                                onNavigateToTransactions = { selectedTabIndex = 3 }
                            )
                            1 -> BudgetBreakdownScreen(
                                state = state,
                                onUpdateBudgetItemFrequency = { item, field, value ->
                                    viewModel.updateBudgetItemFrequency(item, field, value)
                                },
                                onAddBudgetItem = { cat, sub, amount, freq ->
                                    viewModel.addBudgetItem(cat, sub, amount, freq)
                                },
                                onDeleteBudgetItem = { item ->
                                    viewModel.deleteBudgetItem(item)
                                },
                                onIncludeDepositsChange = { viewModel.setIncludeDeposits(it) },
                                onIncludeTransfersChange = { viewModel.setIncludeTransfers(it) }
                            )
                            2 -> ContributorsCashFlowScreen(
                                state = state,
                                onSaveContributor = { name, incomes, allowance, note, contributions, existingId ->
                                    viewModel.saveContributorWithContributions(
                                        name = name,
                                        incomes = incomes,
                                        allowance = allowance,
                                        note = note,
                                        contributions = contributions,
                                        existingId = existingId
                                    )
                                },
                                onDeleteContributor = { contrib ->
                                    viewModel.deleteContributor(contrib)
                                }
                            )
                            3 -> TransactionsScreen(
                                state = state,
                                onSaveTransaction = { draft -> viewModel.saveTransaction(draft) },
                                onDeleteTransaction = { t ->
                                    viewModel.deleteTransaction(t)
                                }
                            )
                            4 -> SyncAndAccountsScreen(
                                state = state,
                                onTriggerSync = { viewModel.triggerGoogleSheetsSync() },
                                onUpdateSheetConfig = { id, name -> viewModel.updateMasterSheetConfig(id, name) },
                                onImportSpreadsheetText = { text -> viewModel.importSpreadsheetText(text) },
                                onExportBackup = { targetFile, onComplete ->
                                    viewModel.exportBackup(targetFile, onComplete)
                                },
                                onResetToSeedData = { viewModel.resetToSeedData() },
                                onAddAccount = { name, type, bal, target, color ->
                                    viewModel.addAccount(name, type, bal, target, color)
                                }
                            )
                        }
                    }

                    if (showNewPeriodDialog) {
                        NewPeriodDialog(
                            onDismiss = { showNewPeriodDialog = false },
                            onConfirm = { name, weeks, start, end, note ->
                                viewModel.createNewPeriod(name, weeks, start, end, note)
                                showNewPeriodDialog = false
                            }
                        )
                    }

                    if (showAddTransactionDialog) {
                        TransactionDialog(
                            accounts = state.accounts,
                            budgetItems = state.budgetItems,
                            existingTransactions = state.transactions,
                            onDismiss = { showAddTransactionDialog = false },
                            onSave = { draft ->
                                viewModel.saveTransaction(draft)
                                showAddTransactionDialog = false
                            }
                        )
                    }
                }
            }
        }
    }
}
