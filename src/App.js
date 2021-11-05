import React, { useState, useMemo } from "react";
import qs from "qs";
import axios from "axios";
import styled from "styled-components";
import { Calendar, momentLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { useFetch, useInterval } from "./hooks";
import moment from "moment";
import "./App.css";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { confirmAlert } from "react-confirm-alert"; // Import
import "react-confirm-alert/src/react-confirm-alert.css"; // Import css
import cleaner from "./cleaner";
import summaryCalculator, { findProject } from "./summaryCalculator";
import useSWR, { trigger } from "swr";

const DragAndDropCalendar = withDragAndDrop(Calendar);
const globalizeLocalizer = momentLocalizer(moment);
const startDate = new Date(new Date().setMonth(new Date().getMonth() - 2));
const endDate = new Date();
function Event({ title, event }) {
  return (
    <span>
      <strong>{title}</strong>
      <br />
      <small>{event.project}</small>
    </span>
  );
}
const StyledTable = styled.table`
  > tbody > tr > td {
    border: 1px solid lightgray;
    text-align: right;
    vertical-align: top;
  }
`;

const Container = styled.div`
  display: grid;
  grid-template-columns: auto 260px;
  grid-template-areas: "calendar totals";
  grid-template-rows: auto;
  height: 100vh;
`;
const LeftPanel = styled.div`
  grid-area: calendar;
  justify-self: stretch;
`;
const RightPanel = styled.div`
  grid-area: totals;
  justify-self: stretch;
  overflow-y: auto;
`;

var getDateArray = function(start, end) {
  var arr = [],
    dt = new Date(start);

  while (dt <= end) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }

  return arr;
};
const clean = cleaner({ treshold: 15 * 60 * 1000, removePattern: /Pomodoro/ });
function App() {
  const [start_date] = useState(startDate);
  const [end_date, setEndDate] = useState(endDate);
  const [apiToken] = useState(process.env.REACT_APP_TOGGL_API_KEY);
  const [summary, setSummary] = useState([]);
  const axiosConfig = {
    auth: {
      username: apiToken,
      password: "api_token"
    }
  };
  const data = useSWR();
  const [myEventsList, loadEvents] = useFetch(
    `https://www.toggl.com/api/v8/time_entries?${qs.stringify({
      start_date,
      end_date
    })}`,
    axiosConfig
  );
  const [myProjects] = useFetch(
    `https://www.toggl.com/api/v8/workspaces/172633/projects`,
    axiosConfig
  );

  const events = myEventsList.map(o => ({
    ...o,
    start: moment(o.start).toDate(),
    stop: moment(o.stop).toDate(),
    project: findProject(myProjects, parseInt(o.pid))
  }));
  useInterval(() => {
    setEndDate(new Date());
    loadEvents();
  }, 5 * 60 * 1000);
  const saveEvent = async event => {
    await axios.put(
      `https://www.toggl.com/api/v8/time_entries/${event.event.id}`,
      {
        time_entry: {
          start: moment(event.start).format(),
          stop: moment(event.end).format(),
          duration: event.end / 1000 - event.start / 1000
        }
      },
      axiosConfig
    );
    loadEvents();
  };
  const deleteEvent = async event => {
    confirmAlert({
      title: "Confirm to delete",
      message: "Are you sure to do this?",
      buttons: [
        {
          label: "Yes",
          onClick: async () => {
            await axios.delete(
              `https://www.toggl.com/api/v8/time_entries/${event.id}`,
              axiosConfig
            );
            loadEvents();
          }
        },
        {
          label: "No"
        }
      ]
    });
  };
  const cleanUp = async event => {
    console.log("cleanup", event);
    const toReduce = events.filter(
      e => e.start >= event.start && e.stop <= event.end && e.duration >= 0
    );
    const result = clean(
      toReduce.map(o => ({
        id: o.id,
        start: o.start.getTime(),
        stop: o.stop.getTime(),
        title: o.description
      }))
    );
    if (result.deletes.length > 0 || result.updates.length > 0) {
      confirmAlert({
        title: "Confirm to cleanup",
        message: "Are you sure to do this?",
        buttons: [
          {
            label: "Yes",
            onClick: async () => {
              for (const deletion of result.deletes) {
                await axios.delete(
                  `https://www.toggl.com/api/v8/time_entries/${deletion.id}`,
                  axiosConfig
                );
              }
              for (const update of result.updates) {
                await axios.put(
                  `https://www.toggl.com/api/v8/time_entries/${update.id}`,
                  {
                    time_entry: {
                      duration: update.stop / 1000 - update.start / 1000,
                      start: moment(update.start).format(),
                      stop: moment(update.stop).format()
                    }
                  },
                  axiosConfig
                );
              }

              loadEvents();
            }
          },
          {
            label: "No"
          }
        ]
      });
    }
  };
  const selectEvent = async event => {
    if (event.duration !== event.stop / 1000 - event.start / 1000) {
      confirmAlert({
        title: "Confirm to fix duration",
        message: "Are you sure to do this?",
        buttons: [
          {
            label: "Yes",
            onClick: async () => {
              await axios.put(
                `https://www.toggl.com/api/v8/time_entries/${event.id}`,
                {
                  time_entry: {
                    duration: event.stop / 1000 - event.start / 1000
                  }
                },
                axiosConfig
              );
              loadEvents();
            }
          },
          {
            label: "No"
          }
        ]
      });
    }
  };
  const rangeChanged = async dates => {
    if (dates.start) {
      dates = getDateArray(dates.start, dates.end);
    }
    var sum = dates.map(date => summaryCalculator(date, events, myProjects));
    setSummary(sum);
  };
  return (
    <Container>
      <LeftPanel>
        <DragAndDropCalendar
          style={{ padding: 15, height: "100vh" }}
          selectable
          resizable
          localizer={globalizeLocalizer}
          events={events}
          startAccessor="start"
          endAccessor="stop"
          titleAccessor="description"
          onEventResize={saveEvent}
          onEventDrop={saveEvent}
          onDoubleClickEvent={deleteEvent}
          onSelectEvent={selectEvent}
          onSelectSlot={cleanUp}
          defaultView="week"
          step={30}
          timeslots={2}
          onRangeChange={rangeChanged}
          views={["month", "week"]}
          components={{
            event: Event
          }}
        />
      </LeftPanel>
      <RightPanel>
        <StyledTable>
          <tbody>
            {summary &&
              summary
                .filter(s => s.budgets.length > 0)
                .map(s => (
                  <tr key={s.date}>
                    <td>{s.date}</td>
                    <td>
                      <table>
                        <tbody>
                          <tr>
                            <td></td>
                            <th>{s.hours}</th>
                          </tr>
                          {s.budgets.map(b => (
                            <tr key={b.name}>
                              <th>{b.name}</th>
                              <td>{b.hoursInText}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ))}
            {summary && (
              <tr>
                <td>Sum</td>
                <th>{summary.reduce((a, b) => a + parseFloat(b.hours), 0)}</th>
              </tr>
            )}
          </tbody>
        </StyledTable>
      </RightPanel>
    </Container>
  );
}

export default App;
