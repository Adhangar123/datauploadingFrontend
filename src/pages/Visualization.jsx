import React, { useEffect, useState } from "react";
import axios from "axios";
import CountUp from "react-countup";

import {
BarChart,
Bar,
XAxis,
YAxis,
Tooltip,
CartesianGrid,
PieChart,
Pie,
Cell,
ResponsiveContainer,
Legend
} from "recharts";

import "../style/Visualization.css";

const API_URL =
"https://datauploadingbackend-13977221722.asia-south2.run.app/api/farmerdata?limit=5000";

const COLORS = ["#4CAF50","#2196F3","#FF9800","#E91E63","#9C27B0","#00BCD4"];

const Visualization = () => {

const [data,setData] = useState([]);
const [allData,setAllData] = useState([]);

const [stateChart,setStateChart] = useState([]);
const [districtChart,setDistrictChart] = useState([]);
const [villageChart,setVillageChart] = useState([]);

const [filters,setFilters] = useState({
project:"",
state:"",
district:"",
gp:""
});

const [projects,setProjects] = useState([]);
const [states,setStates] = useState([]);
const [districts,setDistricts] = useState([]);
const [gps,setGps] = useState([]);

const [stats,setStats] = useState({
farmers:0,
states:0,
districts:0,
projects:0
});

useEffect(()=>{
fetchData();
},[]);

const fetchData = async ()=>{

try{

const res = await axios.get(API_URL);

const farmers = res.data.data;

setAllData(farmers);
setData(farmers);

generateStats(farmers);
generateDropdowns(farmers);
generateCharts(farmers);

}catch(err){
console.error(err);
}

};

const generateStats = (farmers)=>{

setStats({
farmers:farmers.length,
states:new Set(farmers.map(f=>f.state)).size,
districts:new Set(farmers.map(f=>f.district)).size,
projects:new Set(farmers.map(f=>f.project_code)).size
});

};

const generateDropdowns = (farmers)=>{

setProjects([...new Set(farmers.map(f=>f.project_code))]);
setStates([...new Set(farmers.map(f=>f.state))]);
setDistricts([...new Set(farmers.map(f=>f.district))]);
setGps([...new Set(farmers.map(f=>f.blocks))]);

};

const generateCharts = (farmers)=>{

const stateMap={};
const districtMap={};
const villageMap={};

farmers.forEach(f=>{

if(f.state){
stateMap[f.state]=(stateMap[f.state]||0)+1;
}

if(f.district){
districtMap[f.district]=(districtMap[f.district]||0)+1;
}

if(f.village){
villageMap[f.village]=(villageMap[f.village]||0)+1;
}

});

setStateChart(
Object.keys(stateMap).map(key=>({
name:key,
value:stateMap[key]
}))
);

setDistrictChart(
Object.keys(districtMap).map(key=>({
name:key,
value:districtMap[key]
}))
);

const sortedVillages =
Object.keys(villageMap)
.map(v=>({name:v,value:villageMap[v]}))
.sort((a,b)=>b.value-a.value)
.slice(0,10);

setVillageChart(sortedVillages);

};

const handleFilter=(e)=>{

const {name,value}=e.target;

const newFilters={...filters,[name]:value};

setFilters(newFilters);

applyFilters(newFilters);

};

const applyFilters=(f)=>{

let filtered=[...allData];

if(f.project){
filtered=filtered.filter(x=>x.project_code===f.project);
}

if(f.state){
filtered=filtered.filter(x=>x.state===f.state);
}

if(f.district){
filtered=filtered.filter(x=>x.district===f.district);
}

if(f.gp){
filtered=filtered.filter(x=>x.blocks===f.gp);
}

setData(filtered);

generateCharts(filtered);
generateStats(filtered);

};

const resetFilters=()=>{

setFilters({
project:"",
state:"",
district:"",
gp:""
});

setData(allData);
generateCharts(allData);
generateStats(allData);

};

return(

<div className="visualization-container">

<h2 className="dashboard-title">Farmer Dashboard</h2>

{/* KPI CARDS */}

<div className="kpi-grid">

<div className="kpi-card">
<h4>Total Farmers</h4>
<h2><CountUp end={stats.farmers} duration={2}/></h2>
</div>

<div className="kpi-card">
<h4>States</h4>
<h2><CountUp end={stats.states} duration={2}/></h2>
</div>

<div className="kpi-card">
<h4>Districts</h4>
<h2><CountUp end={stats.districts} duration={2}/></h2>
</div>

<div className="kpi-card">
<h4>Projects</h4>
<h2><CountUp end={stats.projects} duration={2}/></h2>
</div>

</div>
{/* CHARTS */}

<div className="charts-grid">

<div className="chart-card">

<h3>Farmers by State</h3>

<ResponsiveContainer width="100%" height={300}>
<BarChart data={stateChart}>
<CartesianGrid strokeDasharray="3 3"/>
<XAxis dataKey="name"/>
<YAxis/>
<Tooltip/>
<Bar dataKey="value" fill="#4CAF50"/>
</BarChart>
</ResponsiveContainer>

</div>

<div className="chart-card">

<h3>Farmers by District</h3>

<ResponsiveContainer width="100%" height={300}>
<PieChart>

<Pie
data={districtChart}
dataKey="value"
nameKey="name"
outerRadius={110}
label
>

{districtChart.map((entry,index)=>(
<Cell key={index} fill={COLORS[index%COLORS.length]}/>
))}

</Pie>

<Legend/>
<Tooltip/>

</PieChart>
</ResponsiveContainer>

</div>

<div className="chart-card">

<h3>Top 10 Villages</h3>

<ResponsiveContainer width="100%" height={300}>
<BarChart data={villageChart}>
<CartesianGrid strokeDasharray="3 3"/>
<XAxis dataKey="name"/>
<YAxis/>
<Tooltip/>
<Bar dataKey="value" fill="#2196F3"/>
</BarChart>
</ResponsiveContainer>

</div>

</div>
{/* FILTERS */}

<div className="filters-container">

<div className="filter-item">
<label>PROJECT</label>
<select name="project" value={filters.project} onChange={handleFilter}>
<option value="">All Projects</option>
{projects.map((p,i)=>(
<option key={i} value={p}>{p}</option>
))}
</select>
</div>

<div className="filter-item">
<label>FROM DATE</label>
<input type="date"/>
</div>

<div className="filter-item">
<label>TO DATE</label>
<input type="date"/>
</div>

<div className="filter-item">
<label>STATE</label>
<select name="state" value={filters.state} onChange={handleFilter}>
<option value="">All States</option>
{states.map((s,i)=>(
<option key={i} value={s}>{s}</option>
))}
</select>
</div>

<div className="filter-item">
<label>DISTRICT</label>
<select name="district" value={filters.district} onChange={handleFilter}>
<option value="">All Districts</option>
{districts.map((d,i)=>(
<option key={i} value={d}>{d}</option>
))}
</select>
</div>

<div className="filter-item">
<label>GP/IP</label>
<select name="gp" value={filters.gp} onChange={handleFilter}>
<option value="">All GP/IPs</option>
{gps.map((g,i)=>(
<option key={i} value={g}>{g}</option>
))}
</select>
</div>

<button className="reset-btn" onClick={resetFilters}>⟳</button>

</div>
{/* TABLE */}

<div className="table-card">

<h3>Farmer Data</h3>

<div className="table-scroll">

<table className="farmer-table">

<thead>

<tr>
<th>Farmer ID</th>
<th>Name</th>
<th>State</th>
<th>District</th>
<th>Village</th>
<th>Project</th>
</tr>

</thead>

<tbody>

{data.map((f,i)=>(
<tr key={i}>
<td>{f.farmer_id}</td>
<td>{f.farmer_name}</td>
<td>{f.state}</td>
<td>{f.district}</td>
<td>{f.village}</td>
<td>{f.project_code}</td>
</tr>
))}

</tbody>

</table>

</div>

</div>

</div>

);

};

export default Visualization;