package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.handyman.marketplace.network.ApiService
import kotlinx.coroutines.launch

@Composable
fun AdminDashboardScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService
) {
    var stats by remember { mutableStateOf<com.handyman.marketplace.models.AdminStatsResponse?>(null) }
    var loading by remember { mutableStateOf(true) }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val prefs = androidx.compose.ui.platform.LocalContext.current.getSharedPreferences("admin_prefs", android.content.Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", "") ?: ""
        coroutineScope.launch {
            try {
                val res = apiService.adminStats("Bearer $token")
                if (res.isSuccessful) {
                    stats = res.body()
                }
            } catch (e: Exception) {
                // ignore
            } finally {
                loading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Dashboard") },
                actions = {
                    IconButton(onClick = {}) {
                        Icon(
                            imageVector = androidx.compose.material.icons.Icons.Default.Logout,
                            contentDescription = "Logout"
                        )
                    }
                }
            )
        }
    ) { padding ->
        if (loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (stats != null) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text("Platform Overview", style = MaterialTheme.typography.headlineLarge)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard("Total Users", stats!!.users.toString(), MaterialTheme.colorScheme.primary)
                    StatCard("Handymen", stats!!.handymen.toString(), MaterialTheme.colorScheme.secondary)
                    StatCard("Clients", stats!!.clients.toString(), MaterialTheme.colorScheme.tertiary)
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StatCard("Total Jobs", stats!!.jobs.toString(), MaterialTheme.colorScheme.primary)
                    StatCard("Completed", stats!!.completed.toString(), MaterialTheme.colorScheme.secondary)
                    StatCard("Pending", stats!!.pending.toString(), MaterialTheme.colorScheme.tertiary)
                }

                Text("Platform Revenue (18% commission)", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
                Text(text = "\$${stats!!.platform_revenue.toString().takeWhile { it != '.' }}", style = MaterialTheme.typography.headlineLarge)

                Button(
                    onClick = { navController.navigate("admin_jobs") },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Manage All Jobs")
                }
                Button(
                    onClick = { navController.navigate("admin_users") },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Manage Users")
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text(text = "Failed to load stats", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
fun StatCard(title: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Card(
        modifier = Modifier.weight(1f),
        elevation = 2.dp,
        shape = androidx.compose.material3.Shapes.Medium
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
        ) {
            Text(text = value, style = MaterialTheme.typography.headlineLarge, color = color)
            Text(text = title, style = MaterialTheme.typography.bodySmall)
        }
    }
}
