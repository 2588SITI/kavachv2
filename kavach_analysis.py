import streamlit as st
import pandas as pd
import plotly.express as px

# Page Configuration
st.set_page_config(page_title="Kavach Analysis Dashboard", layout="wide", page_icon="🛡️")

# --- CUSTOM CSS FOR GLASS-MORPHISM LOOK ---
st.markdown("""
    <style>
    /* Main background */
    .stApp {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f8fafc;
    }
    
    /* Glass Card Effect */
    div[data-testid="stMetric"] {
        background: rgba(255, 255, 255, 0.03);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }
    
    /* Sidebar styling */
    section[data-testid="stSidebar"] {
        background-color: rgba(15, 23, 42, 0.95);
        border-right: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* Headers */
    h1, h2, h3 {
        color: #ffffff !important;
        font-weight: 700 !important;
        letter-spacing: -0.02em;
    }

    /* Success/Critical Colors */
    .metric-label { color: #94a3b8; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; }
    </style>
    """, unsafe_allow_html=True)

# --- SIDEBAR NAVIGATION ---
with st.sidebar:
    st.image("https://picsum.photos/seed/kavach/200/100", use_container_width=True)
    st.title("🛡️ Kavach Pro")
    st.markdown("---")
    menu = st.radio("Navigation", ["Dashboard", "Station Analysis", "Detailed Logs", "Settings"])
    st.markdown("---")
    st.info("System Status: **Healthy**")

# --- MAIN CONTENT ---
if menu == "Dashboard":
    st.title("🛡️ Executive Summary")
    st.markdown("Real-time RFCOMM and NMS Health Monitoring")
    
    # File Upload Section
    uploaded_file = st.file_uploader("Upload RFCOMM Log File", type=["csv", "xlsx"])

    if uploaded_file:
        try:
            if uploaded_file.name.endswith('.csv'):
                df = pd.read_csv(uploaded_file)
            else:
                df = pd.read_excel(uploaded_file)
            
            df.columns = [c.strip() for c in df.columns]
            
            # Metrics Row
            avg_success = df['Percentage'].mean()
            total_stations = len(df['Station Id'].unique())
            critical_stns = len(df[df['Percentage'] < 95])

            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Overall Success", f"{avg_success:.2f}%", delta=f"{avg_success-95:.1f}%" if avg_success > 95 else f"{avg_success-95:.1f}%", delta_color="normal")
            with col2:
                st.metric("Stations", total_stations)
            with col3:
                st.metric("Critical Issues", critical_stns, delta="-2" if critical_stns > 0 else "0", delta_color="inverse")

            # Chart Section
            st.markdown("### 📊 RFCOMM Performance (Nominal vs Reverse)")
            fig = px.bar(
                df, x="Station Id", y="Percentage", color="Direction",
                barmode="group",
                color_discrete_map={"Nominal": "#10b981", "Reverse": "#34d399", "Nominal ": "#10b981", "Reverse ": "#34d399"},
                template="plotly_dark"
            )
            fig.add_hline(y=95, line_dash="dash", line_color="#ef4444")
            fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)')
            st.plotly_chart(fig, use_container_width=True)

        except Exception as e:
            st.error(f"Error: {e}")
    else:
        st.info("Please upload a log file to see the dashboard.")

elif menu == "Station Analysis":
    st.title("🚉 Station-wise Deep Dive")
    st.info("Select a station from the sidebar to see detailed packet analysis.")

elif menu == "Detailed Logs":
    st.title("📋 Detailed RFCOMM Logs")
    # Table logic here...
