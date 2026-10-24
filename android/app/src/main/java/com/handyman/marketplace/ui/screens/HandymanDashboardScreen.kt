package com.handyman.marketplace.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.handyman.marketplace.models.Job
import com.handyman.marketplace.network.ApiService
import kotlinx.coroutines.launch

@Composable
fun HandymanDashboardScreen(
    navController: androidx.navigation.navController,
    apiService: ApiService
) {
    var jobs by remember { mutableStateOf<List<Job>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var earnings by remember { mutableStateOf(0.0) }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val prefs = LocalContext.current.getSharedPreferences("handyman_prefs", android.content.Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", "") ?: ""
        coroutineScope.launch {
            try {
                val res = apiService.listJobs("Bearer $token")
                if (res.isSuccessful) {
                    jobs = res.body()!!.jobs
                    earnings = res.body()!!.jobs.filter { it.status == "completed" }.sumOf { it.handyman_earning }
                } else {
                    // ignore errors for demo
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
                title = { Text("Handyman Dashboard") },
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
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Text("Earnings", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 8.dp))
            Text(text = "\$${earnings.toString().takeWhile { it != '.' }}", style = MaterialTheme.typography.headlineLarge)
            Text(text = "18% commission already deducted from each job", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 16.dp))

            Text("Your Jobs", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(0.dp)
            ) {
                if (loading) {
                    item { CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally)) }
                } else {
                    items(jobs) { job ->
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                            elevation = 2.dp
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(text = job.title, style = MaterialTheme.typography.titleMedium)
                                Text(text = "Client: ${job.client_name ?: "Client"}", style = MaterialTheme.typography.bodySmall)
                                Text(text = "Address: ${job.address}", style = MaterialTheme.typography.bodySmall)
                                Text(text = "Status: ${job.status}", style = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.primary))
                                Text(text = "Earnings: \$${job.handyman_earning}", style = MaterialTheme.typography.labelMedium)

                                when (job.status) {
                                    "pending" -> {
                                        Button(onClick = {
                                            coroutineScope.launch {
                                                val prefs = LocalContext.current.getSharedPreferences("handyman_prefs", android.content.Context.MODE_PRIVATE)
                                                val token = prefs.getString("auth_token", "") ?: ""
                                                val res = apiService.updateJobStatus("Bearer $token", job.id, com.handyman.marketplace.models.UpdateJobStatusRequest(status = "accepted"))
                                                if (res.isSuccessful) {
                                                    // refresh handled by navigation or state
                                                }
                                            }
                                        }) { Text("Accept Job") }
                                    }
                                    "accepted" -> Button(onClick = {}) { Text("Start Job") }
                                    "in_progress" -> Button(onClick = {}) { Text("Mark Complete") }
                                    else -> Box(Modifier.fillMaxWidth())
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
