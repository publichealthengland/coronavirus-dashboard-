// @flow

import React, { useState, useEffect } from "react";

import useResponsiveLayout from "hooks/useResponsiveLayout";
import { PlotContainer } from "./Plotter.styles";

import numeral from "numeral";
import Plotly from "plotly.js";
import createPlotlyComponent from 'react-plotly.js/factory';
import { Toggle, ToggleButton } from "components/ToggleButton/ToggleButton";
import { deviation, median } from "d3-array";
import cloneDeep from "lodash.clonedeep"
import { analytics } from "common/utils";
import Loading from "components/Loading";

import type { ComponentType } from "react";


const Plot = createPlotlyComponent(Plotly);


const axRef = {
    y: {
        fixedragne: false,
        tickslen: 0,
        tickson: "boundaries",
        ticklen: 'labels',
        tickcolor: "#f1f1f1",
        tickfont: {
            family: `"GDS Transport", Arial, sans-serif`,
            color: "#6B7276",
        }
    }
};


const logThresholds = [
    -10_000, -1_000, -10, 1, 10, 100, 1_000, 10_000, 100_000,
    1_000_000, 10_000_000, 100_000_000, 1_000_000_000
];


const prepLogData = (data, original, barmode, minVal, maxVal, width) => {

    let ticktext = [
        minVal,
        ...logThresholds.filter(value => value > minVal && value < maxVal),
        maxVal
    ];

    let tickvals;

    if ( barmode === "stack" ) {
        // Log stack bars:
        // This is not currently used on the website - but just in case.
        for ( let itemIndex = 0; itemIndex < data.length; itemIndex ++ ) {
            data[itemIndex].text = data[itemIndex].y;
            data[itemIndex].hovertemplate = '%{text:.1f}';
            data[itemIndex].textposition = 'none';
        }

        tickvals = ticktext.filter(val => val > 0).map(val => !val ? val : val * ((val >= 0) || -1));
        ticktext = tickvals.map(val => ticktext.includes(val) ? numeral(val).format("0,0.[0]") : "");
    }

    for ( let itemIndex = 0; itemIndex < data.length; itemIndex++ ) {
        data[itemIndex].text = original[itemIndex].y;

        for ( let ind = 0; ind < data[itemIndex].y.length; ind++ ) {
            const value = data[itemIndex].y?.[ind] ?? 0;
            data[itemIndex].y[ind] = !value
                ? NaN
                : Math.log10(Math.abs(value)) * ((value >= 0) || -1);
        }

        data[itemIndex].hovertemplate = '%{text:.1f}';
        data[itemIndex].textposition = 'none';
    }

    // Calculate minor grids
    tickvals = ticktext.reduce((acc, cur, ind, arr) => {
        if ( cur >= -10 && cur <= 10 ) {
            acc.push(cur)
        } else {
            const prevValue = Math.abs(arr[ind - 1]) * 2;

            for ( let tick = arr[ind - 1] + prevValue; tick < cur; tick += prevValue ) {
                acc.push(tick)
            }

            acc.push(cur);
        }

        return acc
    }, []);

    let tickFormat = "0,0.[0]";
    if ( width !== "desktop" ) tickFormat = "0.[0]a";

    ticktext = tickvals.map(val => ticktext.includes(val) ? numeral(val).format(tickFormat) : "");
    tickvals = tickvals.map(val => !val ? 1 : Math.log10(Math.abs(val)) * ((val >= 0) || -1));

    return { ticktext, tickvals, data, tickmode: 'array'}

};  // prepLogData



const getExtrema = ( data, barmode: string, yScale ) => {

    let minVal, maxVal;

    if ( barmode !== "stack" ) {

        [minVal, maxVal] = [
            Math.min(...data.map(item => Math.min(0, ...item.y)).filter(item => !isNaN(item))),
            Math.max(...data.map(item => Math.max(...item.y)).filter(item => !isNaN(item)))
        ];

    }
    else if ( yScale ) {

        const stackedSum = [];
        const longestLength = Math.max(...data.map(item => item?.y?.length));

        for ( let stackInd = 0; stackInd < longestLength; stackInd ++ ) {
            stackedSum.push(data.reduce((acc, cur) => acc + (cur?.y?.[stackInd] ?? 0), 0));
        }

        [minVal, maxVal] = [
            Math.min(0, ...stackedSum.filter(item => !isNaN(item))),
            Math.max(...stackedSum.filter(item => !isNaN(item)))
        ];

    }

    const std = median(data.filter(item => item.y.length > 10).map(item => deviation(item.y)));
    const mid = median(data.filter(item => item.y.length > 10).map(item => median(item.y)));

    return { minVal, maxVal, std, mid };

};  // getExtrema


export const BasePlotter: ComponentType<*> = ({ data: payload, layout = {}, xaxis = {}, yaxis = {},
                                                  config = {}, margin = {}, style = {},
                                                  isTimeSeries = true, SrOnly = "",
                                                  noLogScale=false, ...props }) => {

    const width = useResponsiveLayout(640);
    const [ isLog, setIsLog ] = useState(false);
    const { barmode } = layout;
    const { chartMode } = props;
    const yAxisRef = Object.assign({}, axRef.y);
    let labelSuffix = "";
    let [mid, std] = [0, 0];
    const [ drawData, setDrawData ] = useState({
        data: [],
        ticktext: undefined,
        tickvals: undefined,
        tickmode: undefined,
        mid: mid,
        std: std
    });

    const isLogScale = (isLog && barmode === "stack") && !noLogScale;
    yAxisRef.ticks = "outside";
    // Alternatives - Non-log: ",.2r" / mobile: 3s

    if ( width === "desktop" ) {
        yAxisRef.tickfont.size = 13;
        if ( isLogScale ) {
            yAxisRef.type = "log";
        }
    }
    else {
        yAxisRef.tickfont.size = 10;
        yAxisRef.ticks = "inside";
    }

    useEffect(() => {

        const {minVal, maxVal, mid, std} = getExtrema(payload, barmode, isLog);

        if ( isLog ) {
            let data = cloneDeep(payload);

            setDrawData({
                ...prepLogData(data, payload, barmode, minVal, maxVal),
                mid,
                std
            });
        }
        else {
            setDrawData({data: payload, mid, std});
        }

    }, [ isLog, barmode, payload ]);


    if ( chartMode === "percentage" ) labelSuffix += "%";

    for ( let index = 0; index < drawData.data.length; index++ ) {

        if ( "overlaying" in drawData.data[index] ) {
            yAxisRef.rangemode = "tozero";
            layout = {
                yaxis2: {
                    ...yAxisRef,
                    overlaying: drawData.data[index].overlaying,
                    side: drawData.data[index].side,
                    rangemode: "tozero",
                    showgrid: false,

                }
            };

            margin = { ...margin, r: 50 };
        }

        if ( !Array.isArray(drawData.data[index]?.hovertemplate) && drawData.data[index]?.type !== "heatmap" ) {

            drawData.data[index].hovertemplate = [];

            for ( const value of payload[index]?.y ?? [] ) {
                drawData.data[index].hovertemplate.push(
                    numeral(value).format("0,0.[0]") + labelSuffix
                );
            }

        }

    }

    useEffect(() => {
        if ( isLog ) {
            analytics({
                category: "log-scale",
                action: "click",
                label: `${props?.heading} [${document.title}]`,
            })
        }
    }, [ isLog ]);

    if ( !drawData.data?.length ) return <Loading/>;

    return <PlotContainer className={ "govuk-grid-row" }
                          aria-label={ "Displaying a graph of the data" }>
        {
            noLogScale || barmode === "stack" ||
            props?.chartMode === "percentage" || drawData.std < drawData.mid
                ? null
                : <Toggle style={{ marginTop: "-25px", float: "right" }}>
                    <ToggleButton onClick={ () => setIsLog(false) }
                                  className={ "govuk-!-font-size-14" }
                                  active={ isLog === false }>
                        Linear
                    </ToggleButton>
                    <ToggleButton onClick={ () => setIsLog(true) }
                                  className={ "govuk-!-font-size-14" }
                                  active={ isLog === true }>
                        Log
                    </ToggleButton>
                </Toggle>
        }
        <p className={ "govuk-visually-hidden" }>
            The data that is visualised in the chart is that which is tabulated
            under the "Data" tab. The tables do not include the rolling average metric
            (where the metric is included).
            { SrOnly }
        </p>
        <Plot
            data={ drawData.data }
            config={ {
                showLink: false,
                responsive: true,
                displaylogo: false,
                // displayModeBar: true,
                modeBarButtonsToRemove: [
                    "autoScale2d",
                    "toggleSpikelines",
                    "hoverClosestCartesian",
                    "pan2d",
                    "select2d",
                    "lasso2d",
                ],
                toImageButtonOptions: {
                    format: 'png',
                    filename: 'export',
                    height: 989,
                    width: 1600,
                    scale: 4
                },
                ...config
                // onLegendItem
            } }
            useResizeHandler={ true }
            style={ { display: "block", height: 350, ...style } }
            layout={ {
                hovermode: "x unified",
                hoverdistance: 1,
                legend: {
                    orientation: 'h',
                    font: {
                        family: `"GDS Transport", Arial, sans-serif`,
                        size: width === "desktop" ? 15 : 12,
                    },
                    xanchor: 'auto',
                    // yanchor: 'auto'
                    y: -.2
                },
                showlegend: true,
                margin: {
                    l: width === "desktop" ? 45 : 35,
                    r: width === "desktop" ? 10 : 5,
                    b: 25,
                    t: 10,
                    pad: 0,
                    ...margin
                },
                xaxis: {
                    showgrid: false,
                    zeroline: false,
                    showline: false,
                    // fixedrange: width !== "desktop",
                    fixedrange: false,
                    tickslen: 10,
                    ticks: "outside",
                    tickson: "boundaries",
                    ticklen: 'labels',
                    type: isTimeSeries ? "date" : "category",
                    tickformat: '%-d %b',
                    tickfont: {
                        family: `"GDS Transport", Arial, sans-serif`,
                        size: width === "desktop" ? 14 : 10,
                        color: "#6B7276"
                    },
                    // rangeslider: {range: ['20202-01-01', new Date().toString()]},
                    // rangeselector: {buttons: [
                    //     {
                    //       count: 7,
                    //       label: '7d',
                    //       step: 'day',
                    //       stepmode: 'backward'
                    //     },
                    //         {
                    //       count: 1,
                    //       label: '1m',
                    //       step: 'month',
                    //       stepmode: 'backward'
                    //     },
                    //         {
                    //       count: 3,
                    //       label: '3m',
                    //       step: 'month',
                    //       stepmode: 'backward'
                    //     },
                    //     {step: 'all'}
                    //   ]},
                    ...xaxis,
                },
                yaxis: {
                    tickmode: drawData?.tickmode,
                    tickvals: drawData?.tickvals,
                    ticktext: drawData?.ticktext,
                    ...yAxisRef,
                    ...yaxis
                },
                plot_bgcolor: "rgba(231,231,231,0)",
                paper_bgcolor: "rgba(255,255,255,0)",
                ...layout
            } }
            { ...props }
        />
    </PlotContainer>;

}; // Plotter
